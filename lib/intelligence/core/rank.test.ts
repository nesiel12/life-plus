import { describe, expect, it } from "vitest";
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

describe("rankSignals", () => {
  it("returns an empty array for no signals", () => {
    expect(rankSignals([])).toEqual([]);
  });

  it("ranks a higher-importance signal above a lower-importance one at equal confidence", () => {
    const [top] = rankSignals([
      signal({ id: "low", importance: 0.2 }),
      signal({ id: "high", importance: 0.9 }),
    ]);
    expect(top.id).toBe("high");
  });

  it("ranks a higher-confidence signal above a lower-confidence one at equal importance", () => {
    const [top] = rankSignals([
      signal({ id: "unsure", confidence: 0.2 }),
      signal({ id: "sure", confidence: 0.9 }),
    ]);
    expect(top.id).toBe("sure");
  });

  it("assigns every ranked signal a score and a reason", () => {
    const [ranked] = rankSignals([signal({})]);
    expect(typeof ranked.score).toBe("number");
    expect(ranked.reason.length).toBeGreaterThan(0);
  });

  it("hedges low-confidence signals in their reason", () => {
    const [ranked] = rankSignals([signal({ confidence: 0.2 })]);
    expect(ranked.reason).toContain("ביטחון נמוך");
  });

  it("breaks equal scores by category priority (upcomingEvent before memory)", () => {
    const result = rankSignals([
      signal({ id: "mem", category: "memory", importance: 0.5, confidence: 0.5 }),
      signal({ id: "event", category: "upcomingEvent", importance: 0.5, confidence: 0.5 }),
    ]);
    expect(result.map((s) => s.id)).toEqual(["event", "mem"]);
  });

  it("preserves original input order for identical score and category (stable ordering)", () => {
    const result = rankSignals([
      signal({ id: "first", category: "goal" }),
      signal({ id: "second", category: "goal" }),
      signal({ id: "third", category: "goal" }),
    ]);
    expect(result.map((s) => s.id)).toEqual(["first", "second", "third"]);
  });

  it("produces a fully deterministic ordering across repeated calls", () => {
    const input = [
      signal({ id: "a", category: "goal", importance: 0.6 }),
      signal({ id: "b", category: "memory", importance: 0.6 }),
      signal({ id: "c", category: "upcomingEvent", importance: 0.9 }),
    ];
    const first = rankSignals(input).map((s) => s.id);
    const second = rankSignals(input).map((s) => s.id);
    expect(first).toEqual(second);
  });
});
