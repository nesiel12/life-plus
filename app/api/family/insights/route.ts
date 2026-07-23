import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getUserByEmail } from "@/lib/db/users";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { peopleRepo } from "@/lib/db/people";
import { momentsRepo } from "@/lib/db/moments";
import { personalDnaRepo } from "@/lib/db/personalDna";
import { recommendationEventsRepo } from "@/lib/db/recommendationEvents";
import { toPerson, toMoment } from "@/lib/mappers";
import { fetchMemoryCandidates, rankMemoryCandidates } from "@/lib/memory/retrieveMemory";
import { createRecommendationEvent, indexPendingEventsByKey } from "@/lib/intelligence/recommendations";
import { rankSignals, CATEGORY_DEFAULTS, WEAK_LIFE_AREA_IMPORTANCE } from "@/lib/intelligence/core";
import type { IntelligenceSignal } from "@/lib/intelligence/core";
import { computeSuggestionConfidence } from "@/lib/suggestionConfidence";
import { buildTimelineEvents } from "@/lib/timeline/buildTimelineEvents";
import { deriveRelationshipHealth } from "@/lib/family/deriveRelationshipHealth";
import { pickSuggestedAction } from "@/lib/family/pickSuggestedAction";
import { daysSince, daysUntilNextAnnualDate, computeActivityTrend } from "@/lib/utils";
import type { PersonInsight } from "@/lib/family/types";

export const runtime = "nodejs";

const RATE_LIMIT = { limit: 20, windowMs: 5 * 60 * 1000 };
const MAX_RELATED_MEMORY = 3;
const DEFAULT_STALE_THRESHOLD_DAYS = 7;
const NEXT_INTERACTION_TYPE = "family_next_interaction";

// Family Experience v2 (docs/ATLAS_ARCHITECTURE_VISION.md §10). Same
// architectural call as Goals/Learning/Areas Experience v2: does not call
// buildAtlasContext — this route needs a fresh, person-scoped moments read
// for interaction history/trend/timeline, and per-person memory queries,
// none of which fit AtlasContext's single pre-formatted bundle. It calls
// the same underlying repos directly, including the exact isPersonStale
// predicate buildAtlasContext.ts's own relationshipSignals now shares.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`family-insights:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const user = await getUserByEmail(session.user.email);
  if (!user) {
    return NextResponse.json({ people: [] });
  }

  const [peopleRows, momentRows, personalDna, recommendationEvents, memoryCandidates] = await Promise.all([
    peopleRepo.list(user.id),
    momentsRepo.list(user.id),
    personalDnaRepo.get(user.id),
    recommendationEventsRepo.list(user.id),
    fetchMemoryCandidates(user.id),
  ]);

  const people = peopleRows.map(toPerson);
  const moments = momentRows.map(toMoment);
  const staleThresholdDays = personalDna?.family_check_in_interval_days ?? DEFAULT_STALE_THRESHOLD_DAYS;

  const pendingNextInteractionByPerson = indexPendingEventsByKey(recommendationEvents, NEXT_INTERACTION_TYPE, "personId");

  const now = Date.now();

  // Recency score per person (0-100, higher = touched more recently
  // relative to their own threshold) feeds computeSuggestionConfidence —
  // the exact same "how far behind the average" math the calendar
  // suggestions confidence bar already uses, reused wholesale rather than a
  // second confidence formula invented for relationships.
  const recencyScores = people.map((person) => {
    const since = person.lastMeaningfulInteraction ? daysSince(person.lastMeaningfulInteraction) : null;
    if (since === null) return 50; // unknown — a neutral midpoint, not a guessed extreme
    return Math.max(0, 100 - (since / staleThresholdDays) * 100);
  });

  const computed = await Promise.all(
    people.map(async (person, i) => {
      const personMoments = moments.filter((m) => m.personId === person.id);
      const daysSinceLastInteraction = person.lastMeaningfulInteraction
        ? daysSince(person.lastMeaningfulInteraction)
        : null;
      const { recentCount, previousCount } = computeActivityTrend(personMoments.map((m) => m.timestamp), now);
      const daysUntilBirthday = person.birthday ? daysUntilNextAnnualDate(person.birthday) : null;

      const health = deriveRelationshipHealth({
        daysSinceLastInteraction,
        staleThresholdDays,
        recentCount,
        previousCount,
      });

      // Memory Engine reuse: the person's own name as the query, same
      // pattern Goals/Learning/Areas Experience v2 each established.
      // Candidates were fetched once above (Atlas Core Optimization v1) —
      // ranking per person is a pure, synchronous pass, not a re-fetch.
      const relatedMemory = rankMemoryCandidates(memoryCandidates, person.hebrewName ?? person.name, MAX_RELATED_MEMORY);

      const picked = pickSuggestedAction({ health, daysUntilBirthday, hasRelatedMemory: relatedMemory.length > 0 });
      const confidence = computeSuggestionConfidence(recencyScores[i], recencyScores);

      const existingEvent = pendingNextInteractionByPerson.get(person.id);
      const recommendationEventId =
        existingEvent?.id ??
        (await createRecommendationEvent(user.id, {
          type: NEXT_INTERACTION_TYPE,
          source: "family_insights_route",
          payload: { personId: person.id, actionType: picked.type },
        }));

      const timeline = buildTimelineEvents({ moments: personMoments, goals: [], knowledgeEntries: [] });

      const insight: PersonInsight = {
        personId: person.id,
        health,
        daysSinceLastInteraction,
        interactionCount: personMoments.length,
        recentCount,
        previousCount,
        daysUntilBirthday,
        relatedMemory,
        suggestedAction: { ...picked, confidence, recommendationEventId },
        timeline,
      };

      // A real per-person relationship signal, ranked with the Intelligence
      // Engine's own formula and category defaults — the same "decide
      // priority order, don't hand-pick it" reuse Areas Experience v2
      // established for its grid, applied here to decide which person
      // surfaces first.
      const signal: IntelligenceSignal = {
        id: `person-${person.id}`,
        category: "relationship",
        source: "family-insights",
        title: person.hebrewName ?? person.name,
        summary: `${person.hebrewName ?? person.name}: ${health}`,
        // Reuses the same elevated-importance boost Areas Experience v2
        // established for a weak life area — a relationship that needs
        // attention deserves the identical signal-priority treatment, not a
        // second hand-copied number (Atlas Core Optimization v1).
        importance: health === "needs_attention" ? WEAK_LIFE_AREA_IMPORTANCE : CATEGORY_DEFAULTS.relationship.importance,
        confidence: CATEGORY_DEFAULTS.relationship.confidence,
        recency: 1,
      };
      const priorityScore = rankSignals([signal])[0]?.score ?? 0;

      return { insight, priorityScore };
    })
  );

  const insights = computed.sort((a, b) => b.priorityScore - a.priorityScore).map((c) => c.insight);

  return NextResponse.json({ people: insights });
}
