import type { Database } from "@/types/database";

type RecommendationEventRow = Database["public"]["Tables"]["recommendation_events"]["Row"];

// Shared by every surface that suggests the same "next action" repeatedly
// across page views for a stable subject — a goal, a knowledge entry, a
// person — rather than a genuinely new suggestion each request (Atlas Core
// Optimization v1). Previously this exact filter/map/type-guard chain was
// written independently in three routes (Goals/Learning/Family insights),
// each just keyed by a different payload field (goalId/entryId/personId).
// Calendar suggestions deliberately doesn't use this: every free-time slot
// really is new each request, so there's nothing to dedupe against.
//
// Pure and DB-free on purpose (no "server-only", no repo import) — the
// caller already has recommendationEventsRepo.list's result in hand; this
// only indexes it. Keeping it pure is what makes it unit-testable without
// pulling in Supabase, the same reasoning every other lib/*/types.ts-
// adjacent pure module in this codebase already follows.
export function indexPendingEventsByKey(
  events: RecommendationEventRow[],
  type: string,
  keyField: string
): Map<string, RecommendationEventRow> {
  const entries: [string, RecommendationEventRow][] = [];
  for (const event of events) {
    if (event.type !== type || event.status !== "pending") continue;
    const payload = event.recommendation_payload as Record<string, unknown> | null;
    const key = payload?.[keyField];
    if (typeof key === "string") entries.push([key, event]);
  }
  return new Map(entries);
}
