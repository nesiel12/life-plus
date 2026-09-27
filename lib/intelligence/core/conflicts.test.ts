import { describe, expect, it } from "vitest";
import { detectPriorityConflicts } from "@/lib/intelligence/core/conflicts";
import { rankSignals } from "@/lib/intelligence/core/rank";
import type { IntelligenceSignal } from "@/lib/intelligence/core/types";

function signal(patch: Partial<IntelligenceSignal>): IntelligenceSignal {
  return {
    id: "s1",
    category: "memory",
    source: "test",
    title: "t",
    summary: "s",
    importance: 0.5,
    confidence: 0.5,
    recency: 1,
    ...patch,
  };
}

describe("detectPriorityConflicts", () => {
  it("finds no conflicts with only one signal", () => {
    const ranked = rankSignals([signal({ id: "goal1", category: "goal" })]);
    expect(detectPriorityConflicts(ranked)).toEqual([]);
  });

  it("flags a goal competing with a relationship signal when both reach the top", () => {
    const ranked = rankSignals([
      signal({ id: "goal1", category: "goal", title: "סיים פרויקט" }),
      signal({ id: "rel1", category: "relationship", title: "התקשר לאמא" }),
    ]);
    const conflicts = detectPriorityConflicts(ranked);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].signalIds.sort()).toEqual(["goal1", "rel1"].sort());
    expect(conflicts[0].note).toContain("סיים פרויקט");
    expect(conflicts[0].note).toContain("התקשר לאמא");
  });

  it("does not flag two top signals from a non-competing category pair", () => {
    const ranked = rankSignals([
      signal({ id: "mem1", category: "memory" }),
      signal({ id: "pattern1", category: "personalPattern" }),
    ]);
    expect(detectPriorityConflicts(ranked)).toEqual([]);
  });

  it("does not flag a competing pair when one signal doesn't make the top of the ranking", () => {
    const ranked = rankSignals([
      signal({ id: "goal1", category: "goal", importance: 0.9, confidence: 0.9 }),
      // Five higher-scoring filler signals push "rel1" past the top-N window.
      ...Array.from({ length: 5 }, (_, i) =>
        signal({ id: `filler${i}`, category: "upcomingEvent", importance: 0.95, confidence: 1 })
      ),
      signal({ id: "rel1", category: "relationship", importance: 0.05, confidence: 0.05 }),
    ]);
    const conflicts = detectPriorityConflicts(ranked);
    expect(conflicts.some((c) => c.signalIds.includes("rel1"))).toBe(false);
  });

  it("never lets one signal anchor more than one conflict, even when it competes with several", () => {
    // goal1 competes with both rel1 (goal/relationship) and event1
    // (goal/upcomingEvent) — all three top signals collide pairwise — but
    // each signal may anchor at most one reported conflict, so only one of
    // the two pairs sharing goal1 can survive, and the other signal in that
    // dropped pair (rel1 or event1) is left unpaired rather than double-booked.
    const ranked = rankSignals([
      signal({ id: "goal1", category: "goal" }),
      signal({ id: "rel1", category: "relationship" }),
      signal({ id: "event1", category: "upcomingEvent" }),
    ]);
    const conflicts = detectPriorityConflicts(ranked);
    expect(conflicts).toHaveLength(1);
    const usedIds = conflicts.flatMap((c) => c.signalIds);
    expect(new Set(usedIds).size).toBe(usedIds.length);
  });

  it("caps the number of conflicts reported even with many colliding signals", () => {
    // Three disjoint competing pairs among six top signals — every pair
    // qualifies, but only MAX_CONFLICTS (2) may be reported.
    const ranked = rankSignals([
      signal({ id: "goal1", category: "goal", importance: 0.9 }),
      signal({ id: "rel1", category: "relationship", importance: 0.9 }),
      signal({ id: "goal2", category: "goal", importance: 0.7 }),
      signal({ id: "event1", category: "upcomingEvent", importance: 0.7 }),
      signal({ id: "rel2", category: "relationship", importance: 0.5 }),
      signal({ id: "event2", category: "upcomingEvent", importance: 0.5 }),
    ]);
    const conflicts = detectPriorityConflicts(ranked);
    expect(conflicts.length).toBeLessThanOrEqual(2);
    const usedIds = conflicts.flatMap((c) => c.signalIds);
    expect(new Set(usedIds).size).toBe(usedIds.length);
  });
});
