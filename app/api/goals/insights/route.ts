import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getUserByEmail } from "@/lib/db/users";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { goalsRepo } from "@/lib/db/goals";
import { personalPatternsRepo } from "@/lib/db/personalPatterns";
import { lifeAreaScoresRepo } from "@/lib/db/lifeAreaScores";
import { recommendationEventsRepo } from "@/lib/db/recommendationEvents";
import { toGoal, toLifeArea } from "@/lib/mappers";
import { fetchMemoryCandidates, rankMemoryCandidates } from "@/lib/memory/retrieveMemory";
import { createRecommendationEvent, indexPendingEventsByKey } from "@/lib/intelligence/recommendations";
import { MIN_CONFIDENCE_TO_SURFACE } from "@/lib/intelligence/personalDNA/confidence";
import { WEAK_LIFE_AREA_SCORE_THRESHOLD } from "@/lib/intelligence/core/normalize";
import { computeSuggestionConfidence } from "@/lib/suggestionConfidence";
import { deriveGoalStage } from "@/lib/goals/deriveGoalStage";
import { estimateDaysRemaining } from "@/lib/goals/estimateCompletion";
import { buildNextActionRationale } from "@/lib/goals/buildNextActionRationale";
import type { GoalInsight } from "@/lib/goals/types";

export const runtime = "nodejs";

const RATE_LIMIT = { limit: 20, windowMs: 5 * 60 * 1000 }; // 20 requests / 5 min
const MAX_RELATED_MEMORY = 3;
const NEXT_ACTION_TYPE = "goal_next_action";

// Goals Experience v2 (docs/ATLAS_ARCHITECTURE_VISION.md §4): per-goal
// insight — stage, real estimated completion, and a Recommendation-
// Intelligence-tracked next action — computed once per request rather than
// derived ad hoc in the client. Deliberately does NOT call buildAtlasContext
// (lib/context/buildAtlasContext.ts): that function always fetches goals,
// life areas, upcoming events, and people together and returns personal
// patterns as pre-formatted prose — this route needs its own fresh goal
// read (canonical, not client-trusted, same reasoning as calendar
// suggestions), the *raw* pattern values for arithmetic (avg days per
// milestone), and a different memory query per goal — none of which fits
// AtlasContext's single-bundle, pre-formatted contract. So it calls the
// same underlying repos/functions Context Engine itself is built from
// directly, rather than paying for a bundle most of which it would discard.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`goals-insights:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const user = await getUserByEmail(session.user.email);
  if (!user) {
    return NextResponse.json({ goals: [] });
  }

  const [goalRows, patternRows, lifeAreaRows, recommendationEvents, memoryCandidates] = await Promise.all([
    goalsRepo.listWithMilestones(user.id),
    personalPatternsRepo.list(user.id),
    lifeAreaScoresRepo.list(user.id),
    recommendationEventsRepo.list(user.id),
    fetchMemoryCandidates(user.id),
  ]);

  const goals = goalRows.map(toGoal);
  const lifeAreas = lifeAreaRows.map(toLifeArea);
  const lifeAreaScores = lifeAreas.map((area) => area.score);

  // Personal DNA reuse: raw pattern rows (not the pre-formatted descriptions
  // getPersonalPatternDescriptions returns) because this route needs the
  // actual numeric pace value and a per-goal confidence gate, not prose.
  const pacePattern = patternRows.find(
    (p) => p.category === "goals" && p.pattern_type === "milestoneCompletionPace" && p.confidence >= MIN_CONFIDENCE_TO_SURFACE
  );
  const avgDaysPerMilestone = pacePattern ? parseFloat(pacePattern.value) : null;

  const taskSizePattern = patternRows.find(
    (p) => p.category === "goals" && p.pattern_type === "taskSizePreference" && p.confidence >= MIN_CONFIDENCE_TO_SURFACE
  );

  // Recommendation Intelligence reuse: don't create a fresh `pending`
  // goal_next_action event on every page view — reuse the existing pending
  // one for this goal if there is one, so repeat visits don't inflate
  // recommendation_events with duplicates of the same still-unanswered
  // suggestion (a real difference from calendar suggestions, where every
  // slot is genuinely new each time).
  const pendingNextActionByGoal = indexPendingEventsByKey(recommendationEvents, NEXT_ACTION_TYPE, "goalId");

  const insights: GoalInsight[] = await Promise.all(
    goals.map(async (goal) => {
      const completedMilestones = goal.milestones.filter((m) => m.done).length;
      const totalMilestones = goal.milestones.length;
      const progress = totalMilestones ? Math.round((completedMilestones / totalMilestones) * 100) : 0;
      const stage = deriveGoalStage({ createdAt: goal.createdAt, completedMilestones, totalMilestones });

      // Memory Engine reuse: the goal's own title is the query, same pattern
      // /api/goals/breakdown already uses when generating milestones.
      // Candidates were fetched once above (Atlas Core Optimization v1) —
      // ranking per goal is a pure, synchronous pass, not a re-fetch.
      const relatedMemory = rankMemoryCandidates(memoryCandidates, goal.title, MAX_RELATED_MEMORY);

      const lifeArea = lifeAreas.find((a) => a.key === goal.category);
      const isWeakestLifeArea = Boolean(lifeArea && lifeArea.score < WEAK_LIFE_AREA_SCORE_THRESHOLD);

      const estimatedDaysRemaining = estimateDaysRemaining(totalMilestones - completedMilestones, avgDaysPerMilestone);

      const nextMilestone = goal.milestones.find((m) => !m.done) ?? null;
      let nextAction: GoalInsight["nextAction"] = null;

      if (nextMilestone) {
        const rationale = buildNextActionRationale({
          stage,
          isWeakestLifeArea,
          hasRelatedMemory: relatedMemory.length > 0,
          taskSizePreference: taskSizePattern
            ? { value: taskSizePattern.value as "smallTasks" | "largeTasks", confidence: taskSizePattern.confidence }
            : null,
        });

        // Real, reused confidence (lib/suggestionConfidence.ts) — how far
        // this goal's life area lags the average, the same signal calendar
        // suggestions' confidence bar already expresses, not a fabricated
        // "AI confidence" invented for this surface.
        const confidence = lifeArea ? computeSuggestionConfidence(lifeArea.score, lifeAreaScores) : 0.5;

        const existingEvent = pendingNextActionByGoal.get(goal.id);
        const recommendationEventId =
          existingEvent?.id ??
          (await createRecommendationEvent(user.id, {
            type: NEXT_ACTION_TYPE,
            source: "goals_insights_route",
            payload: { goalId: goal.id, milestoneId: nextMilestone.id, title: nextMilestone.title },
          }));

        nextAction = {
          milestoneId: nextMilestone.id,
          title: nextMilestone.title,
          rationale,
          confidence,
          recommendationEventId,
        };
      }

      return {
        goalId: goal.id,
        stage,
        progress,
        completedMilestones,
        totalMilestones,
        estimatedDaysRemaining,
        nextAction,
        relatedMemory,
      };
    })
  );

  return NextResponse.json({ goals: insights });
}
