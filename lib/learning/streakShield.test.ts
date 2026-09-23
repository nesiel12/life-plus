import { describe, expect, it } from "vitest";
import { computeStudyStreakWithShields, decideShieldConsumption } from "@/lib/learning/streakShield";

const NOW = new Date("2026-07-20T12:00:00Z").getTime(); // midday UTC, safely mid-day in Jerusalem too

function daysBeforeNowISO(days: number): string {
  return new Date(NOW - days * 86_400_000).toISOString();
}
function dateKeyDaysBefore(days: number): string {
  return new Date(NOW - days * 86_400_000).toISOString().slice(0, 10);
}

describe("computeStudyStreakWithShields", () => {
  it("matches plain computeStudyStreak when nothing is shielded", () => {
    const dates = [daysBeforeNowISO(0), daysBeforeNowISO(1)];
    expect(computeStudyStreakWithShields(dates, [], NOW)).toBe(2);
  });

  it("a shielded gap keeps the streak alive across it", () => {
    // Sessions today and 2 days ago, gap yesterday — shielded.
    const dates = [daysBeforeNowISO(0), daysBeforeNowISO(2)];
    const shielded = [dateKeyDaysBefore(1)];
    expect(computeStudyStreakWithShields(dates, shielded, NOW)).toBe(3);
  });

  it("an unshielded gap still breaks the streak", () => {
    const dates = [daysBeforeNowISO(0), daysBeforeNowISO(2)];
    expect(computeStudyStreakWithShields(dates, [], NOW)).toBe(1);
  });

  it("returns 0 for no sessions and no shields", () => {
    expect(computeStudyStreakWithShields([], [], NOW)).toBe(0);
  });
});

describe("decideShieldConsumption", () => {
  it("returns null when there is no gap (streak unbroken)", () => {
    const dates = [daysBeforeNowISO(0), daysBeforeNowISO(1)];
    expect(decideShieldConsumption({ sessionDates: dates, shieldedDates: [], availableShields: 1, now: NOW })).toBeNull();
  });

  it("returns the gap date when a shield is available", () => {
    // Studied today and 2 days ago; gap yesterday.
    const dates = [daysBeforeNowISO(0), daysBeforeNowISO(2)];
    expect(decideShieldConsumption({ sessionDates: dates, shieldedDates: [], availableShields: 1, now: NOW })).toBe(dateKeyDaysBefore(1));
  });

  it("returns null when there is a gap but no shields are available", () => {
    const dates = [daysBeforeNowISO(0), daysBeforeNowISO(2)];
    expect(decideShieldConsumption({ sessionDates: dates, shieldedDates: [], availableShields: 0, now: NOW })).toBeNull();
  });

  it("does not re-consume a gap that is already shielded", () => {
    const dates = [daysBeforeNowISO(0)];
    const shielded = [dateKeyDaysBefore(1)];
    expect(decideShieldConsumption({ sessionDates: dates, shieldedDates: shielded, availableShields: 1, now: NOW })).toBeNull();
  });

  it("does not act before today has a session — the day isn't over yet", () => {
    // Yesterday missing, but today has no session recorded yet.
    const dates = [daysBeforeNowISO(2)];
    expect(decideShieldConsumption({ sessionDates: dates, shieldedDates: [], availableShields: 1, now: NOW })).toBeNull();
  });

  it("never looks further back than yesterday, even with an old unshielded gap and plenty of shields", () => {
    // A short, healthy 2-day streak — day 2 has no session, but that's
    // where the streak started, not a break in it.
    const dates = [daysBeforeNowISO(0), daysBeforeNowISO(1)];
    expect(decideShieldConsumption({ sessionDates: dates, shieldedDates: [], availableShields: 5, now: NOW })).toBeNull();
  });
});
