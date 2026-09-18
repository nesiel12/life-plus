import { describe, expect, it } from "vitest";
import { computePracticeStats, levelForXp, nextReviewLabel, practiceStreak, xpForLevel, XP } from "@/lib/torah/practiceStats";

const TZ = "Asia/Jerusalem";
// Noon in Jerusalem on 2026-09-17.
const NOW = new Date("2026-09-17T09:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

describe("levels", () => {
  it("uses a gently growing curve", () => {
    expect([1, 2, 3, 4, 5].map(xpForLevel)).toEqual([0, 100, 300, 600, 1000]);
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(650)).toBe(4);
  });
});

describe("practiceStreak", () => {
  it("counts consecutive days back from today", () => {
    expect(practiceStreak([NOW, daysAgo(1), daysAgo(2), daysAgo(4)], NOW, TZ)).toEqual({ days: 3, today: true });
  });

  it("does not break a streak just because today has no practice yet", () => {
    expect(practiceStreak([daysAgo(1), daysAgo(2)], NOW, TZ)).toEqual({ days: 2, today: false });
  });

  it("is zero after a missed day", () => {
    expect(practiceStreak([daysAgo(2), daysAgo(3)], NOW, TZ).days).toBe(0);
  });

  it("follows the user's calendar, not UTC", () => {
    // 23:30 UTC on the 16th is already the 17th in Jerusalem.
    expect(practiceStreak([new Date("2026-09-16T23:30:00Z")], NOW, TZ).today).toBe(true);
  });
});

describe("computePracticeStats", () => {
  it("adds up XP from reviews, answers and finished parts", () => {
    const stats = computePracticeStats({
      cards: [],
      reviews: [
        { grade: 4, reviewedAt: NOW },
        { grade: 0, reviewedAt: NOW },
      ],
      attempts: [
        { score: 85, createdAt: NOW },
        { score: null, createdAt: NOW },
      ],
      completedChunks: 1,
      now: NOW,
      timeZone: TZ,
    });
    expect(stats.xp).toBe(XP.reviewRecalled + XP.reviewForgotten + 9 + XP.attemptMinimum + XP.chunkCompleted);
    expect(stats.averageScore).toBe(85);
    expect(stats.reviewsToday).toBe(2);
    expect(stats.practicedToday).toBe(true);
  });

  it("counts due cards and mastery tiers, ignoring suspended ones", () => {
    const stats = computePracticeStats({
      cards: [
        { repetitions: 0, intervalDays: 0, dueAt: daysAgo(1) },
        { repetitions: 3, intervalDays: 30, dueAt: new Date(NOW.getTime() + 1e9) },
        { repetitions: 5, intervalDays: 120, dueAt: daysAgo(1), suspendedAt: daysAgo(3) },
      ],
      reviews: [],
      attempts: [],
      completedChunks: 0,
      now: NOW,
      timeZone: TZ,
    });
    expect(stats.totalCards).toBe(2);
    expect(stats.dueNow).toBe(1);
    expect(stats.tiers).toEqual({ new: 1, learning: 0, young: 0, mature: 1, mastered: 0 });
    expect(stats.averageScore).toBeNull();
    expect(stats.level).toBe(1);
    expect(stats.xpToNextLevel).toBe(100);
  });
});

describe("nextReviewLabel", () => {
  const at = (ms: number) => new Date(NOW.getTime() + ms);
  it("reads like a person would say it", () => {
    expect(nextReviewLabel(NOW, at(10 * 60_000))).toBe("10 דק׳");
    expect(nextReviewLabel(NOW, at(24 * 3_600_000))).toBe("מחר");
    expect(nextReviewLabel(NOW, at(6 * 86_400_000))).toBe("6 ימים");
    expect(nextReviewLabel(NOW, at(21 * 86_400_000))).toBe("3 שבועות");
    expect(nextReviewLabel(NOW, at(90 * 86_400_000))).toBe("3 חודשים");
  });
});
