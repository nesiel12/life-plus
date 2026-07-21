import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getUserByEmail } from "@/lib/db/users";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { lifeAreaScoresRepo } from "@/lib/db/lifeAreaScores";
import { goalsRepo } from "@/lib/db/goals";
import { momentsRepo } from "@/lib/db/moments";
import { knowledgeEntriesRepo } from "@/lib/db/knowledgeEntries";
import { personalPatternsRepo } from "@/lib/db/personalPatterns";
import { toLifeArea, toGoal, toMoment, toKnowledgeEntry } from "@/lib/mappers";
import { retrieveRelevantMemory } from "@/lib/memory/retrieveMemory";
import { MIN_CONFIDENCE_TO_SURFACE } from "@/lib/intelligence/personalDNA/confidence";
import { rankSignals, CATEGORY_DEFAULTS, WEAK_LIFE_AREA_IMPORTANCE } from "@/lib/intelligence/core";
import type { IntelligenceSignal } from "@/lib/intelligence/core";
import { deriveGoalStage } from "@/lib/goals/deriveGoalStage";
import { buildNextActionRationale } from "@/lib/goals/buildNextActionRationale";
import { deriveAttentionLevel } from "@/lib/areas/deriveAttentionLevel";
import { LIFE_AREA_LIST } from "@/lib/lifeAreas";
import { daysSince, computeActivityTrend } from "@/lib/utils";
import type { Goal } from "@/types";
import type { AreaInsight } from "@/lib/areas/types";

export const runtime = "nodejs";

const RATE_LIMIT = { limit: 20, windowMs: 5 * 60 * 1000 };
const MAX_HIGHLIGHT = 1;

// Picks which active goal in this area gets to inform the area's
// recommended action, when there's more than one: a stuck goal always wins
// (the strongest real signal that attention is needed here), otherwise the
// least-progressed goal — real, deterministic, no invented priority score.
function pickPriorityGoal(goals: Goal[]): Goal | null {
  const active = goals.filter((g) => g.milestones.length === 0 || g.milestones.some((m) => !m.done));
  if (active.length === 0) return null;

  const withStage = active.map((g) => ({
    goal: g,
    stage: deriveGoalStage({
      createdAt: g.createdAt,
      completedMilestones: g.milestones.filter((m) => m.done).length,
      totalMilestones: g.milestones.length,
    }),
    progress: g.milestones.length ? g.milestones.filter((m) => m.done).length / g.milestones.length : 0,
  }));

  const stuck = withStage.find((x) => x.stage === "stuck");
  if (stuck) return stuck.goal;

  return [...withStage].sort((a, b) => a.progress - b.progress)[0].goal;
}

// Areas Experience v2 (docs/ATLAS_ARCHITECTURE_VISION.md §10). Same
// architectural call as Goals/Learning Experience v2: does not call
// buildAtlasContext (this route needs raw goals for per-category counts
// and priority selection, raw pattern rows for the focus insight, and a
// per-area memory query — a fresh AtlasContext call would still need a
// second, direct goalsRepo/personalPatternsRepo fetch on top of it, an
// actual duplicate query, not just an unused field). It calls the same
// underlying repos and functions Context Engine and Goals Experience v2
// are each built from directly.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`areas-insights:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const user = await getUserByEmail(session.user.email);
  if (!user) {
    return NextResponse.json({ areas: [] });
  }

  const [scoreRows, goalRows, momentRows, knowledgeRows, patternRows] = await Promise.all([
    lifeAreaScoresRepo.list(user.id),
    goalsRepo.listWithMilestones(user.id),
    momentsRepo.list(user.id),
    knowledgeEntriesRepo.list(user.id),
    personalPatternsRepo.list(user.id),
  ]);

  const lifeAreas = scoreRows.map(toLifeArea);
  const goals = goalRows.map(toGoal);
  const moments = momentRows.map(toMoment);
  const knowledgeEntries = knowledgeRows.map(toKnowledgeEntry);

  const taskSizePattern = patternRows.find(
    (p) => p.category === "goals" && p.pattern_type === "taskSizePreference" && p.confidence >= MIN_CONFIDENCE_TO_SURFACE
  );

  const now = Date.now();

  const computed = await Promise.all(
    LIFE_AREA_LIST.map(async (meta) => {
      const area = lifeAreas.find((a) => a.key === meta.key);
      const score = area?.score ?? 0;

      // "Faith" activity spans both moments tagged faith and Torah Space's
      // own knowledge_entries — the same mapping Learning Experience v2 and
      // Timeline Experience v1 already established, not a new convention.
      const areaMoments = moments.filter((m) => m.category === meta.key);
      const activityDates =
        meta.key === "faith"
          ? [...areaMoments.map((m) => m.timestamp), ...knowledgeEntries.map((k) => k.date)]
          : areaMoments.map((m) => m.timestamp);

      const { recentCount, previousCount } = computeActivityTrend(activityDates, now);
      const lastActivityDaysAgo =
        activityDates.length > 0
          ? Math.min(...activityDates.map((d) => Math.max(0, daysSince(d))))
          : null;

      const areaGoals = goals.filter((g) => g.category === meta.key);
      const activeGoalsCount = areaGoals.filter(
        (g) => g.milestones.length === 0 || g.milestones.some((m) => !m.done)
      ).length;

      const priorityGoal = pickPriorityGoal(areaGoals);
      const stage = priorityGoal
        ? deriveGoalStage({
            createdAt: priorityGoal.createdAt,
            completedMilestones: priorityGoal.milestones.filter((m) => m.done).length,
            totalMilestones: priorityGoal.milestones.length,
          })
        : null;

      const attentionLevel = deriveAttentionLevel({
        score,
        recentCount,
        previousCount,
        hasStuckGoal: stage === "stuck",
      });

      // Memory Engine reuse: the area's own label as the query — the one
      // real, relevant "what's happened here lately" highlight, same
      // pattern Goals/Learning Experience v2 already established per item.
      const [recentHighlight = null] = await retrieveRelevantMemory(user.id, meta.label, MAX_HIGHLIGHT);

      // Personal DNA reuse: the focus analyzer's own per-area pattern
      // (category "focus", subject = this area's key) — real, confidence-
      // gated, never fabricated when there's no evidence yet.
      const focusPattern = patternRows.find(
        (p) => p.category === "focus" && p.subject === meta.key && p.confidence >= MIN_CONFIDENCE_TO_SURFACE
      );
      const aiInsight = focusPattern?.description ?? null;

      let recommendedAction: AreaInsight["recommendedAction"] = null;
      if (priorityGoal && stage) {
        const nextMilestone = priorityGoal.milestones.find((m) => !m.done);
        if (nextMilestone) {
          const rationale = buildNextActionRationale({
            stage,
            isWeakestLifeArea: attentionLevel === "needs_attention",
            hasRelatedMemory: Boolean(recentHighlight),
            taskSizePreference: taskSizePattern
              ? { value: taskSizePattern.value as "smallTasks" | "largeTasks", confidence: taskSizePattern.confidence }
              : null,
          });
          recommendedAction = { title: nextMilestone.title, rationale, goalTitle: priorityGoal.title };
        }
      }

      // A per-area signal pair, ranked with the Intelligence Engine's own
      // formula and category defaults (docs/ATLAS_ARCHITECTURE_VISION.md
      // §9) — not to pick display text (there's rarely more than one real
      // candidate per area to choose between), but to decide grid order:
      // areas needing attention or carrying a confident behavioral insight
      // surface first, instead of a fixed enum order.
      const signals: IntelligenceSignal[] = [
        {
          id: `area-${meta.key}`,
          category: "lifeArea",
          source: "life-area-scores",
          title: meta.label,
          summary: `${meta.label}: ${score}%`,
          importance: attentionLevel === "needs_attention" ? WEAK_LIFE_AREA_IMPORTANCE : CATEGORY_DEFAULTS.lifeArea.importance,
          confidence: CATEGORY_DEFAULTS.lifeArea.confidence,
          recency: 1,
        },
      ];
      if (focusPattern) {
        signals.push({
          id: `pattern-${meta.key}`,
          category: "personalPattern",
          source: "personal-dna-engine",
          title: "דפוס התנהגות",
          summary: focusPattern.description,
          importance: CATEGORY_DEFAULTS.personalPattern.importance,
          confidence: focusPattern.confidence,
          recency: 1,
        });
      }
      const priorityScore = rankSignals(signals)[0]?.score ?? 0;

      const insight: AreaInsight = {
        areaKey: meta.key,
        score,
        attentionLevel,
        activeGoalsCount,
        recentCount,
        previousCount,
        lastActivityDaysAgo,
        recentHighlight,
        aiInsight,
        recommendedAction,
      };

      return { insight, priorityScore };
    })
  );

  const areas = computed.sort((a, b) => b.priorityScore - a.priorityScore).map((c) => c.insight);

  return NextResponse.json({ areas });
}
