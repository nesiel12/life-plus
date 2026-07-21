import { describe, expect, it } from "vitest";
import { deriveRelationshipHealth, isPersonStale } from "@/lib/family/deriveRelationshipHealth";

function input(patch: Partial<Parameters<typeof deriveRelationshipHealth>[0]> = {}) {
  return { daysSinceLastInteraction: 3, staleThresholdDays: 7, recentCount: 2, previousCount: 2, ...patch };
}

describe("isPersonStale", () => {
  it("is false when there is no interaction history at all", () => {
    expect(isPersonStale(null, 7)).toBe(false);
  });

  it("is false when under the threshold", () => {
    expect(isPersonStale(5, 7)).toBe(false);
  });

  it("is true at or over the threshold", () => {
    expect(isPersonStale(7, 7)).toBe(true);
    expect(isPersonStale(10, 7)).toBe(true);
  });
});

describe("deriveRelationshipHealth", () => {
  it('is "growing" for a brand-new contact with no interaction history yet', () => {
    expect(deriveRelationshipHealth(input({ daysSinceLastInteraction: null }))).toBe("growing");
  });

  it('is "needs_attention" once at or past the stale threshold', () => {
    expect(deriveRelationshipHealth(input({ daysSinceLastInteraction: 7, staleThresholdDays: 7 }))).toBe(
      "needs_attention"
    );
  });

  it('is "healthy" when recently touched with a stable or improving trend', () => {
    expect(deriveRelationshipHealth(input({ daysSinceLastInteraction: 1, recentCount: 3, previousCount: 2 }))).toBe(
      "healthy"
    );
  });

  it('is "growing" when recently touched but the trend is declining', () => {
    expect(deriveRelationshipHealth(input({ daysSinceLastInteraction: 1, recentCount: 1, previousCount: 3 }))).toBe(
      "growing"
    );
  });
});
