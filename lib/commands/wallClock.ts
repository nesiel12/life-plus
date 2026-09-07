// Converting a wall-clock string the model produced into a real instant.
//
// The model is told the user's local time and answers in the same frame
// ("2026-09-08T10:00"). Turning that into an instant requires knowing which
// timezone those digits were written in — `new Date("2026-09-08T10:00")` uses
// the *runtime's* zone, which on a server is UTC, so a 10:00 meeting would be
// created at 13:00 for an Israeli user.

/** Minutes `timeZone` is ahead of UTC at `at`. */
function offsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const hour = get("hour") === 24 ? 0 : get("hour");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return (asUtc - at.getTime()) / 60_000;
}

/**
 * "YYYY-MM-DDTHH:MM" in `timeZone` → an ISO instant, or null if unparseable.
 *
 * Two passes: the offset is itself a function of the instant, so the first
 * guess is refined once. That second pass is what makes a time falling near a
 * DST boundary land on the right side of it.
 */
export function wallClockToInstant(wallClock: string, timeZone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})$/.exec(wallClock.trim());
  if (!match) return null;

  const [, y, mo, d, h, mi] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;

  const naive = Date.UTC(year, month - 1, day, hour, minute);
  let instant = new Date(naive - offsetMinutes(new Date(naive), timeZone) * 60_000);
  instant = new Date(naive - offsetMinutes(instant, timeZone) * 60_000);

  return Number.isFinite(instant.getTime()) ? instant.toISOString() : null;
}
