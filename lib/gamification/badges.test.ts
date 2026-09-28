import { describe, expect, it } from "vitest";
import { BADGE_CATALOG, evaluateBadges, newlyEarnedBadgeIds, type BadgeContext } from "@/lib/gamification/badges";

const EMPTY: BadgeContext = {
  currentStreak: 0,
  longestStreak: 0,
  totalTasksCompleted: 0,
  totalHabitCheckIns: 0,
  totalActiveDays: 0,
  earlyCompletions: 0,
};

describe("BADGE_CATALOG", () => {
  it("has no duplicate ids", () => {
    const ids = BADGE_CATALOG.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("evaluateBadges", () => {
  it("earns nothing from a blank slate", () => {
    expect(evaluateBadges(EMPTY)).toEqual([]);
  });

  it("earns early_bird at exactly the threshold", () => {
    expect(evaluateBadges({ ...EMPTY, earlyCompletions: 5 })).toContain("early_bird");
    expect(evaluateBadges({ ...EMPTY, earlyCompletions: 4 })).not.toContain("early_bird");
  });

  it("earns streak-based badges by longest streak, not current streak", () => {
    const ctx = { ...EMPTY, currentStreak: 0, longestStreak: 30 };
    expect(evaluateBadges(ctx)).toEqual(
      expect.arrayContaining(["streak_starter", "week_warrior", "consistency_king"])
    );
    expect(evaluateBadges(ctx)).not.toContain("century_club");
  });

  it("earns task_crusher at 100 completed tasks", () => {
    expect(evaluateBadges({ ...EMPTY, totalTasksCompleted: 100 })).toContain("task_crusher");
    expect(evaluateBadges({ ...EMPTY, totalTasksCompleted: 99 })).not.toContain("task_crusher");
  });

  it("earns every badge whose threshold is met", () => {
    const maxed: BadgeContext = {
      currentStreak: 200,
      longestStreak: 200,
      totalTasksCompleted: 500,
      totalHabitCheckIns: 500,
      totalActiveDays: 500,
      earlyCompletions: 500,
    };
    expect(evaluateBadges(maxed)).toHaveLength(BADGE_CATALOG.length);
  });
});

describe("newlyEarnedBadgeIds", () => {
  it("returns nothing already in the ledger", () => {
    const ctx = { ...EMPTY, longestStreak: 3 };
    expect(newlyEarnedBadgeIds(ctx, ["streak_starter"])).toEqual([]);
  });

  it("returns ids satisfied now but missing from the ledger", () => {
    const ctx = { ...EMPTY, longestStreak: 7 };
    expect(newlyEarnedBadgeIds(ctx, [])).toEqual(
      expect.arrayContaining(["streak_starter", "week_warrior"])
    );
  });
});
