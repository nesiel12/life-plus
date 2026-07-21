// Pure types only — no runtime imports — mirrors lib/context/types.ts and
// lib/intelligence/personalDNA/types.ts's reasoning: feedback logic must
// stay unit-testable without pulling in DB access.
export type RecommendationStatus = "pending" | "accepted" | "rejected" | "modified" | "expired";

// What a route asks to have tracked when it surfaces a suggestion to the
// user — deliberately generic (type/source are free strings, payload is
// arbitrary JSON) so a future surface (Torah "related session", a chat
// action) can adopt this without a schema change.
export interface CreateRecommendationInput {
  type: string;
  source: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  // Most recommendations start "pending" (the user hasn't responded yet).
  // Some surfaces (goal breakdown today) have no distinct accept/reject
  // step in the UI — the suggestion is used the instant it's generated —
  // and should be logged as already-resolved rather than forced through a
  // pending state nothing will ever transition out of.
  initialStatus?: RecommendationStatus;
}

export interface RecommendationOutcomeEvent {
  type: string;
  status: RecommendationStatus;
}
