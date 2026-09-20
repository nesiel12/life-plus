import { describe, expect, it } from "vitest";
import { MASONRY_ROW_UNIT, masonrySpan } from "@/lib/dashboard/masonry";

describe("masonrySpan", () => {
  it("rounds up to whole rows, so a card never overlaps the one below", () => {
    expect(masonrySpan(80, 8)).toBe(10);
    expect(masonrySpan(81, 8)).toBe(11);
    expect(masonrySpan(87, 8)).toBe(11);
    expect(masonrySpan(88, 8)).toBe(11);
    expect(masonrySpan(1, 8)).toBe(1);
  });

  it("always claims enough height for the card", () => {
    for (let height = 1; height <= 2000; height += 7) {
      const span = masonrySpan(height);
      expect(span * MASONRY_ROW_UNIT, `${height}px`).toBeGreaterThanOrEqual(height);
      // ...and wastes less than a full row.
      expect(span * MASONRY_ROW_UNIT - height, `${height}px`).toBeLessThan(MASONRY_ROW_UNIT);
    }
  });

  it("uses the shared row unit by default", () => {
    expect(masonrySpan(100)).toBe(masonrySpan(100, MASONRY_ROW_UNIT));
  });

  it("gives an unmeasured or nonsensical height a single row", () => {
    for (const bad of [0, -5, NaN, Infinity, -Infinity]) expect(masonrySpan(bad), String(bad)).toBe(1);
  });

  it("guards a nonsensical unit", () => {
    for (const bad of [0, -8, NaN]) expect(masonrySpan(100, bad), String(bad)).toBe(1);
  });
});
