import "server-only";
import { recommendationEventsRepo } from "@/lib/db/recommendationEvents";
import type { CreateRecommendationInput, RecommendationStatus } from "@/lib/intelligence/recommendations/types";

// Every "Atlas suggested X" surface calls this instead of writing to
// recommendation_events directly — the write-path half of the feedback
// loop (docs/ATLAS_ARCHITECTURE_VISION.md §7). Returns the event's real id
// so the caller can hand it back to the client as the suggestion's id
// (see app/api/calendar/suggestions/route.ts) — outcomes are recorded
// against that same id later via recordRecommendationOutcome.
export async function createRecommendationEvent(userId: string, input: CreateRecommendationInput): Promise<string> {
  const event = await recommendationEventsRepo.create(userId, {
    type: input.type,
    source: input.source,
    recommendation_payload: input.payload,
    metadata: input.metadata ?? {},
    status: input.initialStatus ?? "pending",
    responded_at: input.initialStatus && input.initialStatus !== "pending" ? new Date().toISOString() : null,
  });
  return event.id;
}

// The read-path counterpart to acceptSuggestion/dismissSuggestion (and any
// future surface's accept/reject action). Silently a no-op if the event is
// already resolved or doesn't belong to this user — recordOutcome's
// conditional update simply matches zero rows, which is the correct
// behavior for a tracking call racing a page unmount, not an error worth
// surfacing to the user.
export async function recordRecommendationOutcome(
  userId: string,
  eventId: string,
  status: RecommendationStatus
): Promise<void> {
  await recommendationEventsRepo.recordOutcome(userId, eventId, status);
}
