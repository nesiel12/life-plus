import "server-only";
import { recommendationEventsRepo } from "@/lib/db/recommendationEvents";
import { summarizeRecommendationOutcomes } from "@/lib/intelligence/recommendations/feedback";

export { createRecommendationEvent, recordRecommendationOutcome } from "@/lib/intelligence/recommendations/track";

const TYPE_LABELS: Record<string, string> = {
  calendar_suggestion: "הצעות ליומן",
  goal_milestones: "פירוק יעדים לאבני דרך",
};

// The read path — used by the Context Engine (lib/context/
// buildAtlasContext.ts) to answer "which kinds of Atlas suggestions
// actually land with him." Only reports a type once it has enough
// responses to be signal (summarizeRecommendationOutcomes' own threshold),
// and only the types with the strongest signal (positive or negative),
// most-informative first.
export async function getRecommendationInsights(userId: string, limit = 3): Promise<string[]> {
  const events = await recommendationEventsRepo.list(userId);
  const responded = events.filter((event) => event.status !== "pending");
  const summaries = summarizeRecommendationOutcomes(
    responded.map((event) => ({ type: event.type, status: event.status }))
  );

  return summaries
    .sort((a, b) => Math.abs(b.averageWeight) - Math.abs(a.averageWeight))
    .slice(0, limit)
    .map((summary) => {
      const label = TYPE_LABELS[summary.type] ?? summary.type;
      const acceptRate = Math.round((summary.acceptedCount / summary.totalCount) * 100);
      return `${label}: מתקבלות בכ-${acceptRate}% מהמקרים (${summary.acceptedCount} מתוך ${summary.totalCount}).`;
    });
}
