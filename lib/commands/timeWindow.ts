// Building a real UTC instant for "today/tomorrow, this morning/afternoon/
// evening/night" in Israel local time, server-side, where the server
// process itself does not run in Asia/Jerusalem time (same reasoning as
// lib/intelligence/personalDNA/timezone.ts). Correctly handles Israel's
// DST transition (UTC+2 in winter, UTC+3 in summer) by reading the real
// current offset via Intl instead of hardcoding either one — required for
// "clear my evening" (docs/ATLAS_ARCHITECTURE_VISION.md §12) to query the
// right window of the user's real Google Calendar.
import { getLocalDateKey } from "@/lib/intelligence/personalDNA/timezone";

const TIMEZONE = "Asia/Jerusalem";

export type CommandPeriod = "morning" | "afternoon" | "evening" | "night";
export type CommandDay = "today" | "tomorrow";

interface PeriodHours {
  startHour: number;
  endHour: number;
  // "night" runs 21:00 -> 05:00, so its end hour falls on the following
  // calendar day.
  endDayOffset: 0 | 1;
}

// Matches lib/greeting.ts's timeOfDayFromHour boundaries exactly — "evening"
// should mean the same window everywhere in this app.
const PERIOD_HOURS: Record<CommandPeriod, PeriodHours> = {
  morning: { startHour: 5, endHour: 12, endDayOffset: 0 },
  afternoon: { startHour: 12, endHour: 17, endDayOffset: 0 },
  evening: { startHour: 17, endHour: 21, endDayOffset: 0 },
  night: { startHour: 21, endHour: 5, endDayOffset: 1 },
};

export function jerusalemUtcOffsetMinutes(referenceDate: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    timeZoneName: "shortOffset",
  }).formatToParts(referenceDate);
  const raw = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+2";
  const match = raw.match(/GMT([+-])(\d+)(?::(\d+))?/);
  if (!match) return 120;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = match[3] ? Number(match[3]) : 0;
  return sign * (hours * 60 + minutes);
}

// A calendar day + local hour in Israel -> the real UTC instant it
// corresponds to. `referenceForOffset` only needs to be *near* the target
// instant (same DST period) — using "now" is always correct in practice
// since nobody asks Atlas to clear a period more than a few hours away.
export function jerusalemDateTimeToUtc(dateKey: string, hour: number, referenceForOffset: Date): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  const offsetMin = jerusalemUtcOffsetMinutes(referenceForOffset);
  return new Date(Date.UTC(year, month - 1, day, hour, 0, 0) - offsetMin * 60_000);
}

// Pure calendar-date arithmetic (noon UTC sidesteps any local-time DST
// boundary ambiguity — only the Y-M-D matters here, not a real instant).
export function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const noonUtc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  noonUtc.setUTCDate(noonUtc.getUTCDate() + days);
  return `${noonUtc.getUTCFullYear()}-${String(noonUtc.getUTCMonth() + 1).padStart(2, "0")}-${String(noonUtc.getUTCDate()).padStart(2, "0")}`;
}

export function buildCommandTimeWindow(
  period: CommandPeriod,
  day: CommandDay,
  now: Date
): { timeMin: string; timeMax: string } {
  const todayKey = getLocalDateKey(now.toISOString(), TIMEZONE);
  const baseDateKey = day === "tomorrow" ? addDaysToDateKey(todayKey, 1) : todayKey;
  const hours = PERIOD_HOURS[period];

  const start = jerusalemDateTimeToUtc(baseDateKey, hours.startHour, now);
  const endDateKey = hours.endDayOffset === 1 ? addDaysToDateKey(baseDateKey, 1) : baseDateKey;
  const end = jerusalemDateTimeToUtc(endDateKey, hours.endHour, now);

  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}
