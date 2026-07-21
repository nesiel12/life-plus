import { describe, expect, it } from "vitest";
import { computeActivityTrend } from "@/lib/areas/computeActivityTrend";

const NOW = new Date("2026-07-20T12:00:00Z").getTime();

function daysAgoISO(days: number): string {
  return new Date(NOW - days * 86_400_000).toISOString();
}

describe("computeActivityTrend", () => {
  it("returns zero counts for no activity", () => {
    expect(computeActivityTrend([], NOW)).toEqual({ recentCount: 0, previousCount: 0 });
  });

  it("counts activity within the last window as recent", () => {
    const dates = [daysAgoISO(1), daysAgoISO(5), daysAgoISO(13)];
    expect(computeActivityTrend(dates, NOW)).toEqual({ recentCount: 3, previousCount: 0 });
  });

  it("counts activity in the window before that as previous", () => {
    const dates = [daysAgoISO(15), daysAgoISO(20), daysAgoISO(27)];
    expect(computeActivityTrend(dates, NOW)).toEqual({ recentCount: 0, previousCount: 3 });
  });

  it("splits a mix of recent and previous activity correctly", () => {
    const dates = [daysAgoISO(1), daysAgoISO(2), daysAgoISO(16)];
    expect(computeActivityTrend(dates, NOW)).toEqual({ recentCount: 2, previousCount: 1 });
  });

  it("ignores activity older than two full windows", () => {
    const dates = [daysAgoISO(40)];
    expect(computeActivityTrend(dates, NOW)).toEqual({ recentCount: 0, previousCount: 0 });
  });

  it("respects a custom window size", () => {
    const dates = [daysAgoISO(5), daysAgoISO(9)];
    expect(computeActivityTrend(dates, NOW, 7)).toEqual({ recentCount: 1, previousCount: 1 });
  });
});
