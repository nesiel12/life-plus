// Date arithmetic for the calendar's Day / Week / Month / Year ranges.
//
// Pure and separately tested, because every one of these has an edge case
// that only shows up on specific dates — the week that straddles a month
// boundary, stepping from the 31st into a 30-day month, a leap February, the
// hour that does not exist on a DST transition. A view component is the wrong
// place to discover any of them.
//
// Everything is computed with the local-date constructor (new Date(y, m, d))
// rather than millisecond arithmetic. Adding 7 * 86_400_000 to a Date is
// wrong twice a year: across a DST boundary it lands an hour off, and
// repeated stepping accumulates that drift.

export type CalendarRange = "day" | "week" | "month" | "year";

export const CALENDAR_RANGES: CalendarRange[] = ["day", "week", "month", "year"];

/** The Hebrew week starts on Sunday, which is also Date.getDay() === 0. */
const WEEK_START_DAY = 0;

export function isCalendarRange(value: string): value is CalendarRange {
  return value === "day" || value === "week" || value === "month" || value === "year";
}

/** Local "YYYY-MM-DD". Never toISOString() — that shifts to UTC and can
 *  report the wrong day for anyone east or west of Greenwich. */
export function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Local "YYYY-MM", the key the month API takes. */
export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function startOfWeek(date: Date): Date {
  const start = startOfDay(date);
  const shift = (start.getDay() - WEEK_START_DAY + 7) % 7;
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() - shift);
}

/** Days in a given month. Day 0 of the next month is the last of this one. */
export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** The seven days of the week containing `date`, Sunday first. */
export function weekDays(date: Date): Date[] {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) =>
    new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
  );
}

/**
 * The half-open window [from, to) a range covers around its anchor.
 *
 * Half-open on purpose: an event starting at exactly midnight belongs to the
 * day beginning, not the one ending, and a closed interval would count it
 * twice across two adjacent views.
 */
export function rangeBounds(range: CalendarRange, anchor: Date): { from: Date; to: Date } {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const d = anchor.getDate();

  switch (range) {
    case "day":
      return { from: new Date(y, m, d), to: new Date(y, m, d + 1) };
    case "week": {
      const from = startOfWeek(anchor);
      return { from, to: new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7) };
    }
    case "month":
      return { from: new Date(y, m, 1), to: new Date(y, m + 1, 1) };
    case "year":
      return { from: new Date(y, 0, 1), to: new Date(y + 1, 0, 1) };
  }
}

/**
 * Moves the anchor by whole range units.
 *
 * The day is clamped when stepping by month or year, so 31 January + 1 month
 * is 28 (or 29) February rather than the 3rd of March that
 * `new Date(y, m + 1, 31)` silently rolls over to.
 */
export function stepAnchor(range: CalendarRange, anchor: Date, delta: number): Date {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const d = anchor.getDate();

  switch (range) {
    case "day":
      return new Date(y, m, d + delta);
    case "week":
      return new Date(y, m, d + delta * 7);
    case "month":
      return new Date(y, m + delta, Math.min(d, daysInMonth(y, m + delta)));
    case "year":
      // 29 February + 1 year has no counterpart; clamping lands on the 28th.
      return new Date(y + delta, m, Math.min(d, daysInMonth(y + delta, m)));
  }
}

/** True when `date` falls inside the range around `anchor`. */
export function isWithinRange(range: CalendarRange, anchor: Date, date: Date): boolean {
  const { from, to } = rangeBounds(range, anchor);
  return date >= from && date < to;
}

export function isSameDay(a: Date, b: Date): boolean {
  return dateKey(a) === dateKey(b);
}

const HE = "he-IL";

/** What the header says the user is looking at. */
export function rangeLabel(range: CalendarRange, anchor: Date): string {
  switch (range) {
    case "day":
      return anchor.toLocaleDateString(HE, { weekday: "long", day: "numeric", month: "long" });
    case "week": {
      const days = weekDays(anchor);
      const first = days[0];
      const last = days[6];
      // A week that straddles two months has to name both, or "1–7" is a lie
      // about which month it is in.
      const sameMonth = first.getMonth() === last.getMonth();
      const firstPart = sameMonth
        ? String(first.getDate())
        : first.toLocaleDateString(HE, { day: "numeric", month: "short" });
      const lastPart = last.toLocaleDateString(HE, { day: "numeric", month: "long" });
      return `${firstPart}–${lastPart}`;
    }
    case "month":
      return anchor.toLocaleDateString(HE, { month: "long", year: "numeric" });
    case "year":
      return String(anchor.getFullYear());
  }
}

export const RANGE_LABELS: Record<CalendarRange, string> = {
  day: "יום",
  week: "שבוע",
  month: "חודש",
  year: "שנה",
};
