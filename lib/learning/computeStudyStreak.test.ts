import { describe, expect, it } from "vitest";
import { computeStudyStreak } from "@/lib/learning/computeStudyStreak";

const NOW = new Date("2026-07-20T12:00:00Z").getTime(); // midday UTC, safely mid-day in Jerusalem too

function daysBeforeNowISO(days: number): string {
  return new Date(NOW - days * 86_400_000).toISOString();
}

describe("computeStudyStreak", () => {
  it("returns 0 for no sessions at all", () => {
    expect(computeStudyStreak([], NOW)).toBe(0);
  });

  it("returns 1 when only today has a session", () => {
    expect(computeStudyStreak([daysBeforeNowISO(0)], NOW)).toBe(1);
  });

  it("counts consecutive days ending today", () => {
    const dates = [daysBeforeNowISO(0), daysBeforeNowISO(1), daysBeforeNowISO(2)];
    expect(computeStudyStreak(dates, NOW)).toBe(3);
  });

  it("keeps the streak alive when today has no session yet but yesterday did", () => {
    const dates = [daysBeforeNowISO(1), daysBeforeNowISO(2)];
    expect(computeStudyStreak(dates, NOW)).toBe(2);
  });

  it("resets to 0 when neither today nor yesterday has a session", () => {
    const dates = [daysBeforeNowISO(3)];
    expect(computeStudyStreak(dates, NOW)).toBe(0);
  });

  it("stops counting at the first gap", () => {
    const dates = [daysBeforeNowISO(0), daysBeforeNowISO(1), daysBeforeNowISO(3)];
    expect(computeStudyStreak(dates, NOW)).toBe(2);
  });

  it("counts a day only once regardless of how many sessions happened on it", () => {
    const dates = [daysBeforeNowISO(0), daysBeforeNowISO(0), daysBeforeNowISO(1)];
    expect(computeStudyStreak(dates, NOW)).toBe(2);
  });
});
