// Wall-clock time in a named zone → the exact UTC instant.
//
// The calendar NLP resolves "tomorrow at 12:30" into a wall-clock string in
// the *user's* timezone. The server (Vercel = UTC) must not read that with
// `new Date(y, m, d, h, mi)` — that constructs the date in the server's zone,
// so "12:30" for a user in Israel became 12:30 UTC = 15:30 local. That
// 2–3 hour drift is the "suggests a completely different time" bug.

/**
 * Interpret `wallClock` (`YYYY-MM-DDTHH:MM`, optional `:SS`) as a local time
 * in `timeZone` and return the corresponding instant. Returns null on a
 * malformed string.
 *
 * Uses the "format the guess back and measure the gap" technique, which is
 * correct across DST because `Intl.DateTimeFormat` applies the zone's real
 * offset for that moment.
 */
export function zonedWallClockToInstant(wallClock: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(wallClock.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m.map((v) => (v === undefined ? 0 : Number(v)));
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;

  // First guess: pretend the wall clock is already UTC.
  const utcGuess = Date.UTC(y, mo - 1, d, h, mi, se);

  // Read that instant back in the target zone.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(utcGuess));
  const val = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const hour = val("hour") % 24; // Intl can emit "24" at midnight

  const zonedAsUtc = Date.UTC(val("year"), val("month") - 1, val("day"), hour, val("minute"), val("second"));
  const offset = zonedAsUtc - utcGuess;

  return new Date(utcGuess - offset);
}
