// Analysis needs the user's actual local hour/day, not the server process's
// timezone (Date.getHours()/.getDay() use the runtime's local TZ, which on
// most hosting is UTC — computing "peak activity window" against UTC would
// silently mislabel every pattern by 2-3 hours for an Israel-based user).
// Atlas is currently single-user and Hebrew-native, so this is hardcoded
// rather than a stored-per-user setting — revisit if/when Atlas is ever
// multi-timezone.
const DEFAULT_TIMEZONE = "Asia/Jerusalem";

export function getLocalHour(isoDateTime: string, timeZone: string = DEFAULT_TIMEZONE): number {
  const formatted = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hour12: false }).format(
    new Date(isoDateTime)
  );
  const hour = Number(formatted);
  return hour === 24 ? 0 : hour;
}

const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

// Matches the JS Date.getDay() convention (0 = Sunday) so callers can treat
// this as a drop-in local-timezone replacement for it.
export function getLocalDayOfWeek(isoDateTime: string, timeZone: string = DEFAULT_TIMEZONE): number {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(new Date(isoDateTime));
  return WEEKDAY_TO_INDEX[weekday] ?? new Date(isoDateTime).getDay();
}

// A YYYY-MM-DD key in local time — the same distinct-day bucketing
// analyzers/routine.ts uses for its 30-day consistency score, exported so
// lib/learning/computeStudyStreak.ts (Learning Experience v2) buckets days
// identically instead of a second, potentially timezone-inconsistent
// implementation. en-CA happens to format as YYYY-MM-DD.
export function getLocalDateKey(isoDateTime: string, timeZone: string = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(isoDateTime));
}

// "YYYY-MM-DDTHH:MM" local wall clock — the exact shape lib/ai/agents/
// calendarAgent.ts's parseLocalDateTime expects as "nowLocal" (its natural
// counterpart, going the other direction). CalendarAgentPanel's own client-
// side localNow() reads the browser's clock in the browser's own timezone;
// this is that same idea for a server route with no browser to ask (the
// Section AI Router, Sprint 6, resolving a scheduling request typed into
// the main chat rather than the dedicated Calendar page) — so it falls back
// to this module's DEFAULT_TIMEZONE, the same single-user assumption
// getLocalHour/getLocalDayOfWeek/getLocalDateKey already make.
export function getLocalWallClock(isoDateTime: string, timeZone: string = DEFAULT_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(isoDateTime));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  // Intl's 24-hour hour can format midnight as "24" in some engines — clamp
  // it to "00" the same way getLocalHour already normalizes hour 24 to 0.
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}
