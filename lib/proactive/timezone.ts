import { getLocalHour, getLocalDateKey } from "@/lib/intelligence/personalDNA/timezone";
import { nextAllowedHour } from "@/lib/proactive/quietHours";

// Timezone resolution for the Proactive Engine.
//
// lib/intelligence/personalDNA/timezone.ts already has the Intl formatting
// primitives, but it hardcodes Asia/Jerusalem as a documented single-user
// assumption ("revisit if/when Atlas is ever multi-timezone"). Scheduled
// delivery is that revisit: a job deciding whether it is 07:00 for *this*
// person cannot assume everyone lives in one place. The primitives there are
// already timezone-parameterised, so this module is only about resolving
// which zone to pass and doing day-boundary arithmetic in it.

export const DEFAULT_TIMEZONE = "Asia/Jerusalem";

/**
 * Whether a string is a timezone this runtime actually knows.
 *
 * Postgres cannot validate IANA names (the migration's CHECK is only a shape
 * guard), so this is the real gate, applied at every write.
 */
export function isValidTimezone(value: string): boolean {
  if (!value || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The user's zone, or the app default when unset or no longer recognised. */
export function resolveUserTimezone(timezone: string | null | undefined): string {
  if (timezone && isValidTimezone(timezone)) return timezone;
  return DEFAULT_TIMEZONE;
}

/** The user-local hour (0–23) at `at`. */
export function localHourIn(at: Date, timeZone: string): number {
  return getLocalHour(at.toISOString(), timeZone);
}

/** The user-local "YYYY-MM-DD" at `at`. */
export function localDayIn(at: Date, timeZone: string): string {
  return getLocalDateKey(at.toISOString(), timeZone);
}

/**
 * The offset of `timeZone` from UTC at `at`, in minutes (positive east).
 *
 * Computed by formatting the instant in both zones and differencing, rather
 * than from a fixed table — that is what makes it correct across DST
 * transitions, which is the whole reason the daily-cap window and
 * "next 07:00" cannot be plain arithmetic on a UTC timestamp.
 */
function offsetMinutes(at: Date, timeZone: string): number {
  const format = (tz: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(at);

  const toMs = (parts: Intl.DateTimeFormatPart[]) => {
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    const hour = get("hour") === 24 ? 0 : get("hour");
    return Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  };

  return (toMs(format(timeZone)) - toMs(format("UTC"))) / 60_000;
}

/**
 * The instant at which the user's local day containing `at` began.
 *
 * Used as the lower bound of the "how many notifications went out today"
 * count, so the daily cap resets at the user's midnight rather than the
 * server's.
 */
export function startOfLocalDay(at: Date, timeZone: string): Date {
  const offset = offsetMinutes(at, timeZone);
  const shifted = new Date(at.getTime() + offset * 60_000);
  // Zero the wall-clock time in the shifted frame, then shift back.
  const midnightShifted = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate()
  );
  return new Date(midnightShifted - offset * 60_000);
}

/** The instant the user's local day containing `at` ends (next midnight). */
export function endOfLocalDay(at: Date, timeZone: string): Date {
  const start = startOfLocalDay(at, timeZone);
  // Add 25h then re-floor, so a DST-shortened or -lengthened day still lands
  // on the correct next midnight rather than 23:00 or 01:00.
  return startOfLocalDay(new Date(start.getTime() + 25 * 3_600_000), timeZone);
}

/**
 * The next instant at or after `at` whose user-local hour is `targetHour`.
 *
 * Minute-precise on the way out: a briefing scheduled for "07:00" should be
 * 07:00, not 07:41 because that happened to be the minute the sweep ran.
 */
export function nextLocalHour(at: Date, timeZone: string, targetHour: number): Date {
  const dayStart = startOfLocalDay(at, timeZone);
  const candidate = new Date(dayStart.getTime() + targetHour * 3_600_000);
  if (candidate.getTime() > at.getTime()) return candidate;
  const tomorrow = startOfLocalDay(new Date(dayStart.getTime() + 25 * 3_600_000), timeZone);
  return new Date(tomorrow.getTime() + targetHour * 3_600_000);
}

/**
 * When an outbound send may next happen, given quiet hours.
 *
 * Returns `at` itself when the current local hour is already outside the
 * window. Otherwise the next permitted hour, on the hour — deferring an
 * overnight nudge to the morning rather than dropping it.
 */
export function nextSendTime(
  at: Date,
  timeZone: string,
  quietStart: number,
  quietEnd: number
): Date {
  const hour = localHourIn(at, timeZone);
  const allowed = nextAllowedHour(hour, quietStart, quietEnd);
  if (allowed === hour) return at;
  return nextLocalHour(at, timeZone, allowed);
}
