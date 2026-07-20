import { describe, expect, it } from "vitest";
import {
  calculatePatternConfidence,
  resolvePatternUpdate,
  rankPatterns,
  MAX_CONFIDENCE,
} from "@/lib/intelligence/personalDNA/confidence";

describe("calculatePatternConfidence", () => {
  it("returns 0 for zero or negative evidence", () => {
    expect(calculatePatternConfidence(0, 1)).toBe(0);
    expect(calculatePatternConfidence(-1, 1)).toBe(0);
  });

  it("returns a low confidence for a brand-new, single-evidence assumption", () => {
    const confidence = calculatePatternConfidence(1, 1);
    expect(confidence).toBeGreaterThan(0);
    expect(confidence).toBeLessThan(0.25);
  });

  it("increases with more evidence at constant strength", () => {
    const low = calculatePatternConfidence(2, 0.8);
    const high = calculatePatternConfidence(20, 0.8);
    expect(high).toBeGreaterThan(low);
  });

  it("increases with strength at constant evidence", () => {
    const weak = calculatePatternConfidence(10, 0.3);
    const strong = calculatePatternConfidence(10, 0.9);
    expect(strong).toBeGreaterThan(weak);
  });

  it("never reaches or exceeds MAX_CONFIDENCE, even with huge evidence", () => {
    const confidence = calculatePatternConfidence(1_000_000, 1);
    expect(confidence).toBeLessThan(MAX_CONFIDENCE);
  });

  it("clamps out-of-range strength", () => {
    expect(calculatePatternConfidence(10, 5)).toBe(calculatePatternConfidence(10, 1));
    expect(calculatePatternConfidence(10, -5)).toBe(0);
  });
});

describe("resolvePatternUpdate", () => {
  it("treats a first-ever observation as a new assumption", () => {
    const resolved = resolvePatternUpdate(null, { value: "evening", evidenceCount: 1, strength: 1 });
    expect(resolved.value).toBe("evening");
    expect(resolved.confidence).toBe(calculatePatternConfidence(1, 1));
  });

  it("increases confidence when repeated evidence confirms the same belief", () => {
    const first = resolvePatternUpdate(null, { value: "evening", evidenceCount: 3, strength: 0.6 });
    const second = resolvePatternUpdate(
      { value: "evening", confidence: first.confidence },
      { value: "evening", evidenceCount: 12, strength: 0.6 }
    );
    expect(second.confidence).toBeGreaterThan(first.confidence);
  });

  it("discounts confidence when new evidence contradicts the stored belief", () => {
    const freshConfidence = calculatePatternConfidence(10, 0.8);
    const resolved = resolvePatternUpdate(
      { value: "morning", confidence: 0.7 },
      { value: "evening", evidenceCount: 10, strength: 0.8 }
    );
    expect(resolved.value).toBe("evening");
    expect(resolved.confidence).toBeLessThan(freshConfidence);
  });
});

describe("rankPatterns", () => {
  it("drops patterns below the confidence threshold", () => {
    const patterns = [{ confidence: 0.1 }, { confidence: 0.5 }];
    expect(rankPatterns(patterns, 5, 0.3)).toEqual([{ confidence: 0.5 }]);
  });

  it("sorts by confidence descending", () => {
    const patterns = [{ confidence: 0.4 }, { confidence: 0.9 }, { confidence: 0.6 }];
    expect(rankPatterns(patterns, 5, 0).map((p) => p.confidence)).toEqual([0.9, 0.6, 0.4]);
  });

  it("respects the limit", () => {
    const patterns = Array.from({ length: 10 }, (_, i) => ({ confidence: 0.5 + i * 0.01 }));
    expect(rankPatterns(patterns, 3, 0)).toHaveLength(3);
  });
});
