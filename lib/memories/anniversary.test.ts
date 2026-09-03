import { describe, expect, it } from "vitest";
import { findAnniversaries, yearsAgoLabel } from "@/lib/memories/anniversary";

// Local-time construction throughout: memories are a wall-clock concept, so
// building instants any other way would make these tests timezone-dependent.
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0).toISOString();

describe("findAnniversaries", () => {
  const today = new Date(2026, 8, 3, 10, 0, 0); // 2026-09-03

  it("finds a photo from exactly one year ago today", () => {
    const items = [{ creationTime: iso(2025, 9, 3) }];
    const matches = findAnniversaries(items, today);
    expect(matches).toHaveLength(1);
    expect(matches[0].yearsAgo).toBe(1);
  });

  it("finds multiple years back and orders the nearest first", () => {
    const items = [
      { creationTime: iso(2023, 9, 3) },
      { creationTime: iso(2025, 9, 3) },
      { creationTime: iso(2024, 9, 3) },
    ];
    const matches = findAnniversaries(items, today);
    expect(matches.map((m) => m.yearsAgo)).toEqual([1, 2, 3]);
  });

  it("ignores photos from the current year", () => {
    const items = [{ creationTime: iso(2026, 9, 3) }];
    expect(findAnniversaries(items, today)).toEqual([]);
  });

  it("ignores a different day when tolerance is zero", () => {
    const items = [{ creationTime: iso(2025, 9, 5) }];
    expect(findAnniversaries(items, today)).toEqual([]);
  });

  it("includes nearby days within the tolerance window", () => {
    const items = [
      { creationTime: iso(2025, 9, 5) },
      { creationTime: iso(2025, 9, 1) },
      { creationTime: iso(2025, 9, 20) },
    ];
    const matches = findAnniversaries(items, today, { toleranceDays: 3 });
    expect(matches).toHaveLength(2);
  });

  it("orders by closeness to the day before recency", () => {
    const items = [
      { creationTime: iso(2025, 9, 6) }, // 1 year ago, 3 days off
      { creationTime: iso(2023, 9, 3) }, // 3 years ago, exact day
    ];
    const matches = findAnniversaries(items, today, { toleranceDays: 5 });
    expect(matches[0].yearsAgo).toBe(3);
  });

  it("respects maxResults", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ creationTime: iso(2020 + i % 5, 9, 3) }));
    expect(findAnniversaries(items, today, { maxResults: 2 })).toHaveLength(2);
  });

  it("skips unparseable dates instead of throwing", () => {
    const items = [{ creationTime: "not-a-date" }, { creationTime: iso(2025, 9, 3) }];
    expect(findAnniversaries(items, today)).toHaveLength(1);
  });

  it("returns nothing for an empty corpus", () => {
    expect(findAnniversaries([], today)).toEqual([]);
  });

  it("handles a Feb 29 photo viewed in a non-leap year without crashing", () => {
    const leapDay = [{ creationTime: iso(2024, 2, 29) }];
    const feb28 = new Date(2026, 1, 28, 10, 0, 0);
    expect(() => findAnniversaries(leapDay, feb28, { toleranceDays: 2 })).not.toThrow();
    expect(findAnniversaries(leapDay, feb28, { toleranceDays: 2 })).toHaveLength(1);
  });
});

describe("yearsAgoLabel", () => {
  it("uses correct Hebrew grammar for one, two and many", () => {
    expect(yearsAgoLabel(1)).toBe("לפני שנה");
    expect(yearsAgoLabel(2)).toBe("לפני שנתיים");
    expect(yearsAgoLabel(5)).toBe("לפני 5 שנים");
  });
});
