import { describe, expect, it } from "vitest";
import { deriveAttentionLevel } from "@/lib/areas/deriveAttentionLevel";

function input(patch: Partial<Parameters<typeof deriveAttentionLevel>[0]> = {}) {
  return { score: 60, recentCount: 2, previousCount: 2, hasStuckGoal: false, ...patch };
}

describe("deriveAttentionLevel", () => {
  it("flags a low score as needing attention regardless of activity", () => {
    expect(deriveAttentionLevel(input({ score: 30, recentCount: 5, previousCount: 1 }))).toBe("needs_attention");
  });

  it("flags a stuck goal as needing attention even with a good score", () => {
    expect(deriveAttentionLevel(input({ score: 90, hasStuckGoal: true }))).toBe("needs_attention");
  });

  it("flags activity that has fully stopped as needing attention even with a good score", () => {
    expect(deriveAttentionLevel(input({ score: 90, recentCount: 0, previousCount: 3 }))).toBe("needs_attention");
  });

  it("does not flag a brand-new area with no activity history at all", () => {
    expect(deriveAttentionLevel(input({ score: 50, recentCount: 0, previousCount: 0 }))).not.toBe("needs_attention");
  });

  it('is "healthy" for a high score with stable or improving activity', () => {
    expect(deriveAttentionLevel(input({ score: 80, recentCount: 3, previousCount: 2 }))).toBe("healthy");
  });

  it('is "growing" for a high score with declining (but not stopped) activity', () => {
    expect(deriveAttentionLevel(input({ score: 80, recentCount: 1, previousCount: 3 }))).toBe("growing");
  });

  it('is "growing" for a mid-range score with no other strong signal', () => {
    expect(deriveAttentionLevel(input({ score: 55, recentCount: 2, previousCount: 2 }))).toBe("growing");
  });
});
