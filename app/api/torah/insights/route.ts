import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getUserByEmail } from "@/lib/db/users";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { knowledgeEntriesRepo } from "@/lib/db/knowledgeEntries";
import { goalsRepo } from "@/lib/db/goals";
import { personalPatternsRepo } from "@/lib/db/personalPatterns";
import { recommendationEventsRepo } from "@/lib/db/recommendationEvents";
import { toKnowledgeEntry, toGoal } from "@/lib/mappers";
import { retrieveRelevantMemory } from "@/lib/memory/retrieveMemory";
import { rankByRelevance, tokenize, type MemoryCandidate } from "@/lib/memory/rankRelevance";
import { createRecommendationEvent } from "@/lib/intelligence/recommendations";
import { MIN_CONFIDENCE_TO_SURFACE } from "@/lib/intelligence/personalDNA/confidence";
import { computeStudyStreak } from "@/lib/learning/computeStudyStreak";
import { pickNextReview } from "@/lib/learning/pickNextReview";
import type { EntryInsight, LearningInsights } from "@/lib/learning/types";

export const runtime = "nodejs";

const RATE_LIMIT = { limit: 20, windowMs: 5 * 60 * 1000 };
const MAX_RELATED = 3;
const MIN_ENTRY_AGE_DAYS_FOR_REVIEW = 1; // don't suggest "review" on something logged minutes ago
const NEXT_REVIEW_TYPE = "learning_next_review";

interface NextReviewPayload {
  entryId?: string;
}

// Learning Experience v2 (docs/ATLAS_ARCHITECTURE_VISION.md §10). Same
// architectural call as Goals Experience v2's app/api/goals/insights: does
// NOT call buildAtlasContext — this route needs a fresh knowledge_entries
// read regardless, the *raw* personal_patterns values (arithmetic, not
// prose), and per-entry memory queries — none of which fits AtlasContext's
// single-bundle, pre-formatted contract. It calls the same underlying repos
// Context Engine itself is built from directly instead.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`torah-insights:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const user = await getUserByEmail(session.user.email);
  if (!user) {
    return NextResponse.json({ streakDays: 0, topicFocus: null, cadencePerWeek: null, nextReview: null, entries: [] });
  }

  const [entryRows, goalRows, patternRows, recommendationEvents] = await Promise.all([
    knowledgeEntriesRepo.list(user.id),
    goalsRepo.listWithMilestones(user.id),
    personalPatternsRepo.list(user.id),
    recommendationEventsRepo.list(user.id),
  ]);

  const entries = entryRows.map(toKnowledgeEntry);
  const goals = goalRows.map(toGoal);

  // Personal DNA reuse: raw pattern rows (not getPersonalPatternDescriptions'
  // prose) because "learning progress" needs the actual topic word and
  // sessions-per-week number, not a formatted sentence.
  const topicFocusPattern = patternRows.find(
    (p) => p.category === "learning" && p.pattern_type === "learningTopicFocus" && p.confidence >= MIN_CONFIDENCE_TO_SURFACE
  );
  const cadencePattern = patternRows.find(
    (p) => p.category === "learning" && p.pattern_type === "learningCadence" && p.confidence >= MIN_CONFIDENCE_TO_SURFACE
  );

  const streakDays = computeStudyStreak(entries.map((e) => e.date));

  // Recommendation Intelligence reuse: don't spawn a fresh `pending`
  // learning_next_review event on every page view — reuse the existing
  // pending one for this entry, same reasoning as Goals' goal_next_action.
  const pendingReviewByEntry = new Map(
    recommendationEvents
      .filter((event) => event.type === NEXT_REVIEW_TYPE && event.status === "pending")
      .map((event) => [(event.recommendation_payload as NextReviewPayload).entryId, event])
      .filter((entry): entry is [string, (typeof recommendationEvents)[number]] => Boolean(entry[0]))
  );

  const now = Date.now();
  const reviewCandidate = pickNextReview(entries.map((e) => ({ id: e.id, date: e.date, lastReviewedAt: e.lastReviewedAt })));
  const reviewCandidateAgeDays = reviewCandidate
    ? (now - new Date(reviewCandidate.lastReviewedAt ?? reviewCandidate.date).getTime()) / 86_400_000
    : 0;

  let nextReview: LearningInsights["nextReview"] = null;
  if (reviewCandidate && reviewCandidateAgeDays >= MIN_ENTRY_AGE_DAYS_FOR_REVIEW) {
    const entry = entries.find((e) => e.id === reviewCandidate.id)!;
    const entryTokens = tokenize(entry.topic);
    const hasConnectedGoal = goals.some((g) => [...tokenize(g.title)].some((t) => entryTokens.has(t)));

    const rationale = hasConnectedGoal
      ? "השיעור הזה קשור ליעד פעיל שלך, וכדאי לחזור עליו."
      : "לא חזרת על השיעור הזה כבר הכי הרבה זמן מבין השיעורים שלך.";

    const existingEvent = pendingReviewByEntry.get(entry.id);
    const recommendationEventId =
      existingEvent?.id ??
      (await createRecommendationEvent(user.id, {
        type: NEXT_REVIEW_TYPE,
        source: "torah_insights_route",
        payload: { entryId: entry.id, topic: entry.topic },
      }));

    // Confidence here is deliberately simple and real: how many days since
    // it was last touched, saturating at 30 (Memory Engine's own recency
    // half-life, lib/memory/rankRelevance.ts) — not a fabricated number.
    const confidence = Math.min(0.95, 0.5 + reviewCandidateAgeDays / 30);

    nextReview = { entryId: entry.id, topic: entry.topic, rationale, confidence, recommendationEventId };
  }

  const entryInsights: EntryInsight[] = await Promise.all(
    entries.map(async (entry) => {
      const relatedMemory = await retrieveRelevantMemory(user.id, entry.topic, MAX_RELATED);

      const knowledgeCandidates: MemoryCandidate[] = entries
        .filter((e) => e.id !== entry.id)
        .map((e) => ({ id: e.id, text: `${e.topic} ${e.summary} ${e.source}`, timestamp: e.date, label: e.topic }));
      const relatedKnowledge = rankByRelevance(entry.topic, knowledgeCandidates, MAX_RELATED).map((r) => r.label);

      const entryTokens = tokenize(entry.topic);
      const connectedGoals = goals
        .filter((g) => [...tokenize(g.title)].some((t) => entryTokens.has(t)))
        .map((g) => g.title);

      return { entryId: entry.id, relatedMemory, relatedKnowledge, connectedGoals };
    })
  );

  const insights: LearningInsights = {
    streakDays,
    topicFocus: topicFocusPattern?.value ?? null,
    cadencePerWeek: cadencePattern ? parseFloat(cadencePattern.value) : null,
    nextReview,
    entries: entryInsights,
  };

  return NextResponse.json(insights);
}
