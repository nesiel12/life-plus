import { describe, expect, it } from "vitest";
import { computeSuggestionConfidence } from "@/lib/suggestionConfidence";

describe("computeSuggestionConfidence", () => {
  it("returns the baseline when the area matches the average exactly", () => {
    expect(computeSuggestionConfidence(50, [50, 50, 50])).toBe(0.5);
  });

  it("returns the baseline when the area is above average", () => {
    expect(computeSuggestionConfidence(80, [50, 60, 70])).toBe(0.5);
  });

  it("increases confidence the further the area lags behind average", () => {
    const smallGap = computeSuggestionConfidence(40, [50, 50, 50]);
    const bigGap = computeSuggestionConfidence(10, [50, 50, 50]);
    expect(bigGap).toBeGreaterThan(smallGap);
  });

  it("never exceeds the max confidence even with an extreme gap", () => {
    expect(computeSuggestionConfidence(0, [100, 100, 100])).toBeLessThanOrEqual(0.95);
  });

  it("falls back to the baseline for an empty score list", () => {
    expect(computeSuggestionConfidence(30, [])).toBe(0.5);
  });
});
