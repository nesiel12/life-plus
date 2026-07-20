import { describe, expect, it } from "vitest";
import { analyzeRoutinePatterns } from "@/lib/intelligence/personalDNA/analyzers/routine";

const NOW = new Date("2026-07-20T12:00:00Z").getTime();

describe("analyzeRoutinePatterns — mostActiveDay", () => {
  it("produces nothing with fewer than 7 distinct active days", () => {
    const dates = ["2026-07-01T10:00:00Z", "2026-07-02T10:00:00Z", "2026-07-03T10:00:00Z"];
    const result = analyzeRoutinePatterns(dates, NOW);
    expect(result.find((p) => p.patternType === "mostActiveDay")).toBeUndefined();
  });

  it("detects a concentrated most-active weekday", () => {
    // 2026-06-01, -08, -15, -22, -29 are all Mondays; scatter 3 other days in.
    const mondays = ["2026-06-01", "2026-06-08", "2026-06-15", "2026-06-22", "2026-06-29"].map(
      (d) => `${d}T10:00:00Z`
    );
    const others = ["2026-06-03T10:00:00Z", "2026-06-10T10:00:00Z"];
    const result = analyzeRoutinePatterns([...mondays, ...others], NOW);
    const pattern = result.find((p) => p.patternType === "mostActiveDay");
    expect(pattern).toBeDefined();
    expect(pattern?.value).toBe("1"); // Monday, per Date.getDay() convention
    expect(pattern?.description).toContain("שני");
  });

  it("produces nothing when activity is evenly spread across weekdays", () => {
    const dates = [
      "2026-06-01T10:00:00Z",
      "2026-06-02T10:00:00Z",
      "2026-06-03T10:00:00Z",
      "2026-06-04T10:00:00Z",
      "2026-06-05T10:00:00Z",
      "2026-06-06T10:00:00Z",
      "2026-06-07T10:00:00Z",
    ];
    const result = analyzeRoutinePatterns(dates, NOW);
    expect(result.find((p) => p.patternType === "mostActiveDay")).toBeUndefined();
  });
});

describe("analyzeRoutinePatterns — activityConsistency", () => {
  it("produces nothing with less than a week of account history", () => {
    const dates = ["2026-07-19T10:00:00Z", "2026-07-20T10:00:00Z"];
    const result = analyzeRoutinePatterns(dates, NOW);
    expect(result.find((p) => p.patternType === "activityConsistency")).toBeUndefined();
  });

  it("computes a high consistency score for daily activity", () => {
    const dates = Array.from({ length: 20 }, (_, i) => {
      const d = new Date(NOW - i * 86_400_000);
      return d.toISOString();
    });
    const result = analyzeRoutinePatterns(dates, NOW);
    const pattern = result.find((p) => p.patternType === "activityConsistency");
    expect(pattern).toBeDefined();
    expect(Number(pattern?.value)).toBeGreaterThan(0.6);
  });

  it("computes a low consistency score for sparse activity", () => {
    const dates = [
      new Date(NOW).toISOString(),
      new Date(NOW - 10 * 86_400_000).toISOString(),
      new Date(NOW - 20 * 86_400_000).toISOString(),
    ];
    const result = analyzeRoutinePatterns(dates, NOW);
    const pattern = result.find((p) => p.patternType === "activityConsistency");
    expect(pattern).toBeDefined();
    expect(Number(pattern?.value)).toBeLessThan(0.3);
  });
});
