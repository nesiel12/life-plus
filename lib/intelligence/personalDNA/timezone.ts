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
