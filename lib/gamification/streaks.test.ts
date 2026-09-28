import { describe, expect, it } from "vitest";
import {
  availableStreakFreezes,
  computeMomentumStreak,
  decideStreakFreezeConsumption,
  lifetimeStreakFreezesEarned,
} from "@/lib/gamification/streaks";

const NOW = new Date("2026-07-20T12:00:00Z").getTime(); // midday UTC, safely mid-day in Jerusalem too

function dateKeyDaysBefore(days: number): string {
  return new Date(NOW - days * 86_400_000).toISOString().slice(0, 10);
}

function runEndingToday(length: number): string[] {
  return Array.from({ length }, (_, i) => dateKeyDaysBefore(i));
}

describe("computeMomentumStreak", () => {
  it("returns zeros with no activity", () => {
    expect(computeMomentumStreak([], NOW)).toEqual({ currentStreak: 0, longestStreak: 0, activeDays: 0 });
  });

  it("counts a run ending today", () => {
    const state = computeMomentumStreak(runEndingToday(3), NOW);
    expect(state.currentStreak).toBe(3);
    expect(state.longestStreak).toBe(3);
    expect(state.activeDays).toBe(3);
  });

  it("keeps counting when today has no activity yet but yesterday does", () => {
    const dates = [dateKeyDaysBefore(1), dateKeyDaysBefore(2)];
    expect(computeMomentumStreak(dates, NOW).currentStreak).toBe(2);
  });

  it("breaks the current streak on a real gap", () => {
    const dates = [dateKeyDaysBefore(0), dateKeyDaysBefore(2)];
    expect(computeMomentumStreak(dates, NOW).currentStreak).toBe(1);
  });

  it("keeps the current streak alive across a day already merged in as active (freeze-covered)", () => {
    const dates = [dateKeyDaysBefore(0), dateKeyDaysBefore(1), dateKeyDaysBefore(2)];
    expect(computeMomentumStreak(dates, NOW).currentStreak).toBe(3);
  });

  it("finds the longest run even when it's not the current one", () => {
    // A 5-day run in the past, then a gap, then today only.
    const dates = [
      dateKeyDaysBefore(0),
      dateKeyDaysBefore(20),
      dateKeyDaysBefore(21),
      dateKeyDaysBefore(22),
      dateKeyDaysBefore(23),
      dateKeyDaysBefore(24),
    ];
    const state = computeMomentumStreak(dates, NOW);
    expect(state.currentStreak).toBe(1);
    expect(state.longestStreak).toBe(5);
  });
});

describe("lifetimeStreakFreezesEarned", () => {
  it("earns nothing under a full week", () => {
    expect(lifetimeStreakFreezesEarned(runEndingToday(6))).toBe(0);
  });

  it("earns one freeze at exactly one week", () => {
    expect(lifetimeStreakFreezesEarned(runEndingToday(7))).toBe(1);
  });

  it("earns two freezes across a 14-day run", () => {
    expect(lifetimeStreakFreezesEarned(runEndingToday(14))).toBe(2);
  });

  it("sums freezes across separate past runs, not just the latest", () => {
    // Two independent 7-day runs, far apart.
    const runA = Array.from({ length: 7 }, (_, i) => dateKeyDaysBefore(i));
    const runB = Array.from({ length: 7 }, (_, i) => dateKeyDaysBefore(i + 30));
    expect(lifetimeStreakFreezesEarned([...runA, ...runB])).toBe(2);
  });
});

describe("availableStreakFreezes", () => {
  it("is earned minus consumed", () => {
    expect(availableStreakFreezes(runEndingToday(14), 1)).toBe(1);
  });

  it("never goes negative", () => {
    expect(availableStreakFreezes(runEndingToday(7), 5)).toBe(0);
  });
});

describe("decideStreakFreezeConsumption", () => {
  it("returns null when there is no gap", () => {
    const dates = [dateKeyDaysBefore(0), dateKeyDaysBefore(1)];
    expect(
      decideStreakFreezeConsumption({ realActiveDates: dates, consumedDates: [], availableFreezes: 1, now: NOW })
    ).toBeNull();
  });

  it("returns the gap date when a freeze is available", () => {
    const dates = [dateKeyDaysBefore(0), dateKeyDaysBefore(2)];
    expect(
      decideStreakFreezeConsumption({ realActiveDates: dates, consumedDates: [], availableFreezes: 1, now: NOW })
    ).toBe(dateKeyDaysBefore(1));
  });

  it("returns null with a gap but no freezes available", () => {
    const dates = [dateKeyDaysBefore(0), dateKeyDaysBefore(2)];
    expect(
      decideStreakFreezeConsumption({ realActiveDates: dates, consumedDates: [], availableFreezes: 0, now: NOW })
    ).toBeNull();
  });

  it("does not re-consume an already-covered gap", () => {
    const dates = [dateKeyDaysBefore(0)];
    const consumed = [dateKeyDaysBefore(1)];
    expect(
      decideStreakFreezeConsumption({ realActiveDates: dates, consumedDates: consumed, availableFreezes: 1, now: NOW })
    ).toBeNull();
  });

  it("does not act before today has activity", () => {
    const dates = [dateKeyDaysBefore(2)];
    expect(
      decideStreakFreezeConsumption({ realActiveDates: dates, consumedDates: [], availableFreezes: 1, now: NOW })
    ).toBeNull();
  });

  it("never looks further back than yesterday", () => {
    const dates = [dateKeyDaysBefore(0), dateKeyDaysBefore(1)];
    expect(
      decideStreakFreezeConsumption({ realActiveDates: dates, consumedDates: [], availableFreezes: 5, now: NOW })
    ).toBeNull();
  });
});
