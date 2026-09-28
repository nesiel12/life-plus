import { getLocalDateKey } from "@/lib/intelligence/personalDNA/timezone";
import { dateKey } from "@/lib/calendar/ranges";

// The Momentum streak: current run, best-ever run, and Streak Freezes —
// all derived from the raw activity days, never a stored counter. Same
// division lib/learning/streakShield.ts already draws for the Learning
// streak: *whether a day counts* and *whether to spend a freeze* are two
// separate pure decisions, kept apart from each other and from the plain
// walk-backward streak count.

const ONE_DAY_MS = 86_400_000;

/** True when `day` is exactly the local calendar day after `prev` (both
 *  "YYYY-MM-DD"). Constructed from date parts, not millisecond arithmetic,
 *  so a DST transition can't make a genuinely consecutive pair read as a
 *  gap or vice versa. */
function isNextLocalDay(prev: string, day: string): boolean {
  const [y, m, d] = prev.split("-").map(Number);
  return dateKey(new Date(y, m - 1, d + 1)) === day;
}

export interface MomentumStreakState {
  /** Consecutive local days of activity, counted backward from today (or
   *  yesterday if today has no activity yet — the day isn't over). */
  currentStreak: number;
  /** The longest run anywhere in the history given. */
  longestStreak: number;
  /** Total distinct active days ever, for "X days of momentum" copy. */
  activeDays: number;
}

/**
 * `activeDates` is every local day that counts as active, ascending or not —
 * for the streak actually shown to the user, that means real completions
 * *and* any freeze-covered gap the caller has already merged in (mirroring
 * computeStudyStreakWithShields). Freeze-earning (below) deliberately takes
 * a separate, unmerged history instead.
 */
export function computeMomentumStreak(activeDates: readonly string[], now: number = Date.now()): MomentumStreakState {
  const days = new Set(activeDates);
  if (days.size === 0) return { currentStreak: 0, longestStreak: 0, activeDays: 0 };

  let cursor = now;
  if (!days.has(getLocalDateKey(new Date(cursor).toISOString()))) {
    cursor -= ONE_DAY_MS;
  }
  let currentStreak = 0;
  while (days.has(getLocalDateKey(new Date(cursor).toISOString()))) {
    currentStreak += 1;
    cursor -= ONE_DAY_MS;
  }

  const sorted = [...days].sort();
  let longestStreak = 0;
  let run = 0;
  let prev: string | null = null;
  for (const day of sorted) {
    run = prev !== null && isNextLocalDay(prev, day) ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    prev = day;
  }

  return { currentStreak, longestStreak, activeDays: days.size };
}

/** One Streak Freeze per full week of a maintained run — dense enough to
 *  feel earned regularly, sparse enough to stay a reward rather than an
 *  entitlement. */
export const STREAK_FREEZE_EVERY_DAYS = 7;

/**
 * How many Streak Freezes the *history* has ever earned, lifetime.
 *
 * Walks every run of consecutive real activity days (never freeze-covered
 * ones — a freeze bridges a gap for display, it doesn't manufacture more
 * activity to earn further freezes from) and awards one each time a run
 * crosses a new multiple of `STREAK_FREEZE_EVERY_DAYS`. A broken streak
 * keeps whatever it already banked: this sums every run in the whole
 * history, not just the current one, so a relapse never claws back freezes
 * already earned.
 */
export function lifetimeStreakFreezesEarned(realActiveDates: readonly string[]): number {
  const sorted = [...new Set(realActiveDates)].sort();
  let earned = 0;
  let run = 0;
  let prev: string | null = null;
  for (const day of sorted) {
    run = prev !== null && isNextLocalDay(prev, day) ? run + 1 : 1;
    prev = day;
    if (run % STREAK_FREEZE_EVERY_DAYS === 0) earned += 1;
  }
  return earned;
}

/** Earned-so-far minus spent — never a stored balance, same rule
 *  lib/learning/xpShop.ts's availableXp already follows for XP. */
export function availableStreakFreezes(realActiveDates: readonly string[], consumedCount: number): number {
  return Math.max(0, lifetimeStreakFreezesEarned(realActiveDates) - consumedCount);
}

export interface FreezeConsumptionInput {
  /** Real activity days only — unmerged with any past freeze coverage. */
  realActiveDates: readonly string[];
  /** Dates (YYYY-MM-DD) already covered by a past consumption. */
  consumedDates: readonly string[];
  /** How many unconsumed freezes the user currently owns. */
  availableFreezes: number;
  now?: number;
}

/**
 * Decides whether *yesterday* specifically is a gap worth spending a freeze
 * on. Only that one day, not a walk backward through history — same
 * reasoning lib/learning/streakShield.ts's decideShieldConsumption gives:
 * a streak that's simply short has no activity before it started either,
 * and treating that as a gap would eventually spend a freeze on every
 * streak's natural starting edge. Today must already have activity (the day
 * isn't over otherwise), and yesterday must be neither real activity nor
 * already covered.
 */
export function decideStreakFreezeConsumption({
  realActiveDates,
  consumedDates,
  availableFreezes,
  now = Date.now(),
}: FreezeConsumptionInput): string | null {
  if (availableFreezes <= 0) return null;

  const days = new Set(realActiveDates);
  const todayKey = getLocalDateKey(new Date(now).toISOString());
  if (!days.has(todayKey)) return null;

  const yesterdayKey = getLocalDateKey(new Date(now - ONE_DAY_MS).toISOString());
  if (days.has(yesterdayKey) || consumedDates.includes(yesterdayKey)) return null;

  return yesterdayKey;
}
