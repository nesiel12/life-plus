// Gamified progress for "לתרגל" — XP, level, streak, mastery.
//
// Pure, computed from the append-only history (srs_reviews,
// practice_attempts) and current card state, never stored: a stored XP
// counter drifts from the history the moment one write fails, and then the
// number the user is proudest of is wrong.
//
// The weights reward understanding over volume. A thoughtful written answer is
// worth several flashcard reviews, and a failed review still earns a little —
// showing up to review what you forgot is the behaviour the streak exists for.

import { deckProgress, masteryTier, type MasteryTier } from "@/lib/torah/srs";

export interface StatsCard {
  repetitions: number;
  intervalDays: number;
  dueAt: Date;
  suspendedAt?: Date | null;
}

export interface StatsReview {
  grade: number;
  reviewedAt: Date;
}

export interface StatsAttempt {
  score: number | null;
  createdAt: Date;
}

export interface PracticeStatsInput {
  cards: StatsCard[];
  reviews: StatsReview[];
  attempts: StatsAttempt[];
  completedChunks: number;
  now?: Date;
  /** The user's IANA zone, so "today" and the streak follow their calendar. */
  timeZone?: string;
}

export interface PracticeStats {
  xp: number;
  level: number;
  /** 0..1 through the current level. */
  levelProgress: number;
  xpToNextLevel: number;
  streakDays: number;
  practicedToday: boolean;
  dueNow: number;
  totalCards: number;
  tiers: Record<MasteryTier, number>;
  /** 0..1, tier-weighted — see deckProgress in srs.ts. */
  deckProgress: number;
  reviewsToday: number;
  averageScore: number | null;
  completedChunks: number;
}

export const XP = {
  reviewRecalled: 2,
  reviewForgotten: 1,
  chunkCompleted: 20,
  /** An answer earns score/10 XP, and at least this much for trying. */
  attemptMinimum: 2,
} as const;

/** Total XP needed to reach a level: 0, 100, 300, 600, 1000, … */
export function xpForLevel(level: number): number {
  return 50 * level * (level - 1);
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

function dayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function previousDayKey(key: string): string {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Consecutive days with any practice, counting back from today.
 *
 * A day with no practice YET does not break the streak — the day is not over.
 * The count starts from yesterday instead, so opening the app in the morning
 * does not show a streak of zero to someone who practised every day this week.
 */
export function practiceStreak(activity: Date[], now: Date, timeZone: string): { days: number; today: boolean } {
  const days = new Set(activity.map((date) => dayKey(date, timeZone)));
  const today = dayKey(now, timeZone);
  const practicedToday = days.has(today);

  let cursor = practicedToday ? today : previousDayKey(today);
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor = previousDayKey(cursor);
  }
  return { days: streak, today: practicedToday };
}

export function computePracticeStats(input: PracticeStatsInput): PracticeStats {
  const now = input.now ?? new Date();
  const timeZone = input.timeZone ?? "Asia/Jerusalem";

  const reviewXp = input.reviews.reduce(
    (sum, review) => sum + (review.grade >= 3 ? XP.reviewRecalled : XP.reviewForgotten),
    0
  );
  const attemptXp = input.attempts.reduce(
    (sum, attempt) => sum + Math.max(XP.attemptMinimum, Math.round((attempt.score ?? 0) / 10)),
    0
  );
  const xp = reviewXp + attemptXp + input.completedChunks * XP.chunkCompleted;

  const level = levelForXp(xp);
  const floor = xpForLevel(level);
  const ceiling = xpForLevel(level + 1);

  const active = input.cards.filter((card) => !card.suspendedAt);
  const tiers: Record<MasteryTier, number> = { new: 0, learning: 0, young: 0, mature: 0, mastered: 0 };
  for (const card of active) tiers[masteryTier(card)]++;

  const streak = practiceStreak(
    [...input.reviews.map((r) => r.reviewedAt), ...input.attempts.map((a) => a.createdAt)],
    now,
    timeZone
  );
  const today = dayKey(now, timeZone);
  const scored = input.attempts.filter((a) => a.score !== null);

  return {
    xp,
    level,
    levelProgress: ceiling === floor ? 1 : (xp - floor) / (ceiling - floor),
    xpToNextLevel: ceiling - xp,
    streakDays: streak.days,
    practicedToday: streak.today,
    dueNow: active.filter((card) => card.dueAt.getTime() <= now.getTime()).length,
    totalCards: active.length,
    tiers,
    deckProgress: deckProgress(active),
    reviewsToday: input.reviews.filter((r) => dayKey(r.reviewedAt, timeZone) === today).length,
    averageScore:
      scored.length === 0 ? null : Math.round(scored.reduce((sum, a) => sum + (a.score ?? 0), 0) / scored.length),
    completedChunks: input.completedChunks,
  };
}

/**
 * "10 דק׳", "מחר", "6 ימים", "3 שבועות" — how long until a card returns,
 * shown on each grading button so the choice has visible consequences.
 */
export function nextReviewLabel(from: Date, to: Date): string {
  const minutes = Math.round((to.getTime() - from.getTime()) / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} דק׳`;
  const hours = Math.round(minutes / 60);
  if (hours < 20) return `${hours} שע׳`;
  const days = Math.round(hours / 24);
  if (days <= 1) return "מחר";
  if (days < 14) return `${days} ימים`;
  if (days < 60) return `${Math.round(days / 7)} שבועות`;
  if (days < 365) return `${Math.round(days / 30)} חודשים`;
  return `${Math.round((days / 365) * 10) / 10} שנים`;
}
