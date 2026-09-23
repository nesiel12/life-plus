import { getLocalDateKey } from "@/lib/intelligence/personalDNA/timezone";

// The Streak Shield's two pure decisions, kept apart from
// lib/learning/computeStudyStreak.ts (untouched — every other caller of the
// plain streak keeps working exactly as before) and from each other:
// *whether* a day counts toward the streak is one question, *whether to
// spend a shield* covering a gap is a different one, made once, not on
// every read.

const ONE_DAY_MS = 86_400_000;

/**
 * Same walk-backward algorithm as computeStudyStreak, but a date in
 * `shieldedDates` (YYYY-MM-DD, already consumed — see
 * decideShieldConsumption) counts as present even with no real session that
 * day. Never invents credit for a day nobody shielded; only extends what a
 * recorded consumption already paid for.
 */
export function computeStudyStreakWithShields(sessionDates: string[], shieldedDates: readonly string[], now: number = Date.now()): number {
  const distinctDays = new Set(sessionDates.map((d) => getLocalDateKey(d)));
  for (const d of shieldedDates) distinctDays.add(d);
  if (distinctDays.size === 0) return 0;

  let cursor = now;
  if (!distinctDays.has(getLocalDateKey(new Date(cursor).toISOString()))) {
    cursor -= ONE_DAY_MS;
  }

  let streak = 0;
  while (distinctDays.has(getLocalDateKey(new Date(cursor).toISOString()))) {
    streak += 1;
    cursor -= ONE_DAY_MS;
  }
  return streak;
}

export interface ShieldConsumptionInput {
  /** Raw session timestamps, same shape computeStudyStreak takes. */
  sessionDates: string[];
  /** Dates (YYYY-MM-DD) already covered by a past consumption. */
  shieldedDates: readonly string[];
  /** How many unconsumed Streak Shields the person currently owns. */
  availableShields: number;
  now?: number;
}

/**
 * Decides whether *yesterday* specifically is a gap worth spending a
 * shield on. Deliberately checks only that one day, not a walk backward
 * through history: a streak that's simply short (studied today and
 * yesterday, nothing before that) has no session two days ago either, but
 * that's where the streak *started*, not a break in it — treating that as
 * "a gap to shield" would eventually offer to consume a shield for every
 * streak's natural starting edge. The only day a shield can ever
 * meaningfully bridge is the one immediately before today's session,
 * checked fresh each time this runs (no cron, no proactive backfill):
 * today must already have a session (the day isn't over otherwise, same
 * rule computeStudyStreak follows), and yesterday must be neither a real
 * session nor already shielded.
 *
 * Returns yesterday's date (YYYY-MM-DD) to consume a shield for, or null —
 * the caller (app/api/torah/insights/route.ts) is what actually records
 * the spend; this only decides.
 */
export function decideShieldConsumption({ sessionDates, shieldedDates, availableShields, now = Date.now() }: ShieldConsumptionInput): string | null {
  if (availableShields <= 0) return null;

  const distinctDays = new Set(sessionDates.map((d) => getLocalDateKey(d)));
  const todayKey = getLocalDateKey(new Date(now).toISOString());
  if (!distinctDays.has(todayKey)) return null;

  const yesterdayKey = getLocalDateKey(new Date(now - ONE_DAY_MS).toISOString());
  if (distinctDays.has(yesterdayKey) || shieldedDates.includes(yesterdayKey)) return null;

  return yesterdayKey;
}
