// Turning "כל ערב חוץ משישי שבת" into an RRULE Google Calendar understands.
//
// The LLM never writes an RRULE string directly — that is exactly the kind of
// syntax it gets subtly wrong (BYDAY=MO,TU vs a stray semicolon, a COUNT it
// invented). It resolves the request into this small structured shape, and
// this builds the string deterministically.

export const RRULE_WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

export interface Recurrence {
  /** How often it repeats. */
  freq: "daily" | "weekly";
  /**
   * Days of week it lands on, as Date.getDay() indices (Sunday = 0). Required
   * for weekly; ignored for daily. An empty array means "every day of the
   * week", i.e. effectively daily.
   */
  byWeekday?: number[];
  /** Stop after this many occurrences. */
  count?: number;
  /** Or stop on this local date, "YYYY-MM-DD" inclusive. */
  until?: string;
}

const HEBREW_DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

/** A human, Hebrew description of a recurrence — for the confirmation card. */
export function describeRecurrence(recurrence: Recurrence): string {
  const days = normalizeWeekdays(recurrence.byWeekday);

  let base: string;
  if (recurrence.freq === "daily" || days.length === 7 || days.length === 0) {
    base = "כל יום";
  } else if (days.length === 5 && days.every((d) => d >= 0 && d <= 4)) {
    base = "כל יום א׳–ה׳";
  } else if (days.length === 1) {
    base = `כל יום ${HEBREW_DAY_NAMES[days[0]]}`;
  } else {
    base = `כל ${days.map((d) => HEBREW_DAY_NAMES[d]).join(", ")}`;
  }

  if (recurrence.count && recurrence.count > 0) return `${base} · ${recurrence.count} פעמים`;
  if (recurrence.until) {
    const d = new Date(`${recurrence.until}T00:00`);
    if (!Number.isNaN(d.getTime())) {
      return `${base} · עד ${d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })}`;
    }
  }
  return base;
}

function normalizeWeekdays(input: number[] | undefined): number[] {
  if (!input) return [];
  return [...new Set(input.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort((a, b) => a - b);
}

/**
 * Build the `RRULE:` line for Google Calendar's `recurrence` array.
 * Returns null when the shape is not actually recurring (nothing to repeat).
 */
export function buildRRule(recurrence: Recurrence): string | null {
  const parts: string[] = [];
  const days = normalizeWeekdays(recurrence.byWeekday);

  if (recurrence.freq === "weekly" && days.length > 0 && days.length < 7) {
    parts.push("FREQ=WEEKLY");
    parts.push(`BYDAY=${days.map((d) => RRULE_WEEKDAYS[d]).join(",")}`);
  } else {
    // "every day", or weekly-with-every-day, is just DAILY.
    parts.push("FREQ=DAILY");
  }

  if (recurrence.count && recurrence.count > 0) {
    parts.push(`COUNT=${Math.min(recurrence.count, 730)}`);
  } else if (recurrence.until && /^\d{4}-\d{2}-\d{2}$/.test(recurrence.until)) {
    // UNTIL is a UTC timestamp; end-of-day so the last day is included.
    parts.push(`UNTIL=${recurrence.until.replace(/-/g, "")}T235900Z`);
  }

  return `RRULE:${parts.join(";")}`;
}
