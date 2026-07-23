import { describe, expect, it } from "vitest";
import { daysUntil, daysSince, daysUntilNextAnnualDate, computeActivityTrend } from "@/lib/utils";

// daysUntil/daysSince compare against *local* "today" (lib/utils.ts's own
// startOfDay). Building a fixture with toISOString() serializes in UTC,
// which silently picks the wrong calendar day whenever the test runs near
// local midnight in a positive UTC-offset timezone — a real, previously
// flaky bug in this file, not in daysUntil itself. Local date components
// keep the fixture and the function comparing the same calendar day.
function toLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

describe("daysUntil", () => {
  it("returns 0 for today", () => {
    expect(daysUntil(toLocalDateString(new Date()))).toBe(0);
  });

  it("returns a positive count for a future date", () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    expect(daysUntil(toLocalDateString(future))).toBe(5);
  });

  it("returns a negative count for a past date", () => {
    const past = new Date();
    past.setDate(past.getDate() - 3);
    expect(daysUntil(toLocalDateString(past))).toBe(-3);
  });
});

describe("daysSince", () => {
  it("is the inverse of daysUntil", () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const iso = toLocalDateString(future);
    expect(daysSince(iso)).toBe(-daysUntil(iso));
  });
});

describe("daysUntilNextAnnualDate", () => {
  it("returns null for malformed input", () => {
    expect(daysUntilNextAnnualDate("")).toBeNull();
    expect(daysUntilNextAnnualDate("garbage")).toBeNull();
  });

  it("returns 0 when today is the birthday", () => {
    const today = new Date();
    const mmdd = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    expect(daysUntilNextAnnualDate(mmdd)).toBe(0);
  });

  it("rolls over to next year when the birthday already passed this year", () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const mmdd = `${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
    const result = daysUntilNextAnnualDate(mmdd);
    expect(result).not.toBeNull();
    expect(result as number).toBeGreaterThan(300);
  });
});

describe("computeActivityTrend", () => {
  const NOW = new Date("2026-07-20T12:00:00Z").getTime();

  function daysAgoISO(days: number): string {
    return new Date(NOW - days * 86_400_000).toISOString();
  }

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
