import { describe, expect, it } from "vitest";
import { indexPendingEventsByKey } from "@/lib/intelligence/recommendations/dedupe";
import type { Database } from "@/types/database";

type RecommendationEventRow = Database["public"]["Tables"]["recommendation_events"]["Row"];

function event(patch: Partial<RecommendationEventRow>): RecommendationEventRow {
  return {
    id: "e1",
    user_id: "u1",
    type: "goal_next_action",
    source: "test",
    status: "pending",
    recommendation_payload: {},
    metadata: {},
    created_at: "2026-07-01T00:00:00Z",
    responded_at: null,
    ...patch,
  } as RecommendationEventRow;
}

describe("indexPendingEventsByKey", () => {
  it("returns an empty map for no events", () => {
    expect(indexPendingEventsByKey([], "goal_next_action", "goalId").size).toBe(0);
  });

  it("indexes a pending event of the matching type by its payload key", () => {
    const e = event({ id: "e1", recommendation_payload: { goalId: "g1" } });
    const map = indexPendingEventsByKey([e], "goal_next_action", "goalId");
    expect(map.get("g1")).toBe(e);
  });

  it("ignores events of a different type", () => {
    const e = event({ type: "learning_next_review", recommendation_payload: { goalId: "g1" } });
    const map = indexPendingEventsByKey([e], "goal_next_action", "goalId");
    expect(map.size).toBe(0);
  });

  it("ignores events that are no longer pending", () => {
    const e = event({ status: "accepted", recommendation_payload: { goalId: "g1" } });
    const map = indexPendingEventsByKey([e], "goal_next_action", "goalId");
    expect(map.size).toBe(0);
  });

  it("ignores an event whose payload is missing the key field", () => {
    const e = event({ recommendation_payload: { somethingElse: "x" } });
    const map = indexPendingEventsByKey([e], "goal_next_action", "goalId");
    expect(map.size).toBe(0);
  });

  it("ignores a non-string key value", () => {
    const e = event({ recommendation_payload: { goalId: 123 } });
    const map = indexPendingEventsByKey([e], "goal_next_action", "goalId");
    expect(map.size).toBe(0);
  });

  it("indexes multiple matching events by their distinct keys", () => {
    const e1 = event({ id: "e1", recommendation_payload: { goalId: "g1" } });
    const e2 = event({ id: "e2", recommendation_payload: { goalId: "g2" } });
    const map = indexPendingEventsByKey([e1, e2], "goal_next_action", "goalId");
    expect(map.get("g1")).toBe(e1);
    expect(map.get("g2")).toBe(e2);
  });
});
