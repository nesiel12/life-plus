"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { recordRecommendationOutcome } from "@/lib/intelligence/recommendations";
import type { RecommendationStatus } from "@/lib/intelligence/recommendations/types";

// The client-facing half of the feedback loop (docs/ATLAS_ARCHITECTURE_
// VISION.md §7) — called from store/useAtlasStore.ts's acceptSuggestion/
// dismissSuggestion so a user's actual response to a suggestion is
// recorded, not just acted on locally.
export async function recordRecommendationOutcomeAction(
  eventId: string,
  status: RecommendationStatus
): Promise<void> {
  const userId = await getCurrentUserId();
  await recordRecommendationOutcome(userId, eventId, status);
}
