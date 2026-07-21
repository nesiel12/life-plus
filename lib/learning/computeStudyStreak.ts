import { getLocalDateKey } from "@/lib/intelligence/personalDNA/timezone";

const ONE_DAY_MS = 86_400_000;

// Consecutive local-calendar days (Asia/Jerusalem, same as every other
// Personal DNA date bucketing — getLocalDateKey) with at least one learning
// session, counted backward from today. A streak isn't broken until a full
// day has passed with nothing logged — if today has no session *yet*, the
// count starts from yesterday instead of resetting to zero mid-day.
export function computeStudyStreak(sessionDates: string[], now: number = Date.now()): number {
  const distinctDays = new Set(sessionDates.map((d) => getLocalDateKey(d)));
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
