"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

// Day + month pickers for the annual dates the app stores as "MM-DD"
// (birthdays, anniversaries) — plus an OPTIONAL year select when the caller
// wants a full birthdate (Year / Month / Day). The "MM-DD" value/onChange
// contract is unchanged: the recurrence machinery (reminders, "in N days")
// only ever needs month + day. The year, when captured, is a separate
// enrichment the caller stores alongside — used for age, never for
// recurrence.

const HEBREW_MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Parse "MM-DD" → { month, day } (1-based), or nulls when unset/invalid. */
export function parseMonthDay(value: string | undefined): { month: number | null; day: number | null } {
  if (!value || !/^\d{2}-\d{2}$/.test(value)) return { month: null, day: null };
  const [month, day] = value.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return { month: null, day: null };
  return { month, day };
}

function daysInMonth(month: number, year: number | null): number {
  if (month === 2 && year != null) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return DAYS_IN_MONTH[month - 1];
}

function toValue(month: number, day: number, year: number | null): string {
  const clampedDay = Math.min(day, daysInMonth(month, year));
  return `${String(month).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
}

interface MonthDayPickerProps {
  /** "MM-DD" or "". */
  value: string;
  /** Emits "MM-DD" once month + day are set, or "" when either is cleared. */
  onChange: (value: string) => void;
  /** Pass both to add a Year select in front. `year` is the current value
   *  (null = unset); `onYearChange` receives the new year or null. */
  year?: number | null;
  onYearChange?: (year: number | null) => void;
  /** How far back the year list goes. Default 110. */
  yearsBack?: number;
  idPrefix?: string;
  className?: string;
  ariaLabel?: string;
}

export function MonthDayPicker({
  value,
  onChange,
  year,
  onYearChange,
  yearsBack = 110,
  idPrefix,
  className,
  ariaLabel,
}: MonthDayPickerProps) {
  const reactId = useId();
  const base = idPrefix ?? reactId;
  const { month, day } = parseMonthDay(value);
  const withYear = typeof onYearChange === "function";
  const currentYear = new Date().getFullYear();

  const selectClass = "focus-ring rounded-lg bg-fill-subtle px-2.5 py-2 text-sm text-foreground";

  function update(nextMonth: number | null, nextDay: number | null, nextYear: number | null | undefined) {
    if (nextMonth && nextDay) onChange(toValue(nextMonth, nextDay, nextYear ?? year ?? null));
    else onChange("");
  }

  const dayCount = month ? daysInMonth(month, year ?? null) : 31;

  return (
    <div className={cn("flex items-center gap-2", className)} role="group" aria-label={ariaLabel ?? "תאריך"}>
      <select
        id={`${base}-day`}
        aria-label="יום"
        value={day ?? ""}
        onChange={(e) => update(month, e.target.value ? Number(e.target.value) : null, undefined)}
        className={selectClass}
      >
        <option value="">יום</option>
        {Array.from({ length: dayCount }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <select
        id={`${base}-month`}
        aria-label="חודש"
        value={month ?? ""}
        onChange={(e) => update(e.target.value ? Number(e.target.value) : null, day, undefined)}
        className={cn(selectClass, "flex-1")}
      >
        <option value="">חודש</option>
        {HEBREW_MONTHS.map((name, i) => (
          <option key={name} value={i + 1}>
            {name}
          </option>
        ))}
      </select>
      {withYear && (
        <select
          id={`${base}-year`}
          aria-label="שנה"
          value={year ?? ""}
          onChange={(e) => {
            const y = e.target.value ? Number(e.target.value) : null;
            onYearChange!(y);
            // Re-clamp Feb 29 etc. against the new year.
            if (month && day) update(month, day, y);
          }}
          className={cn(selectClass, "tabular-nums")}
        >
          <option value="">שנה</option>
          {Array.from({ length: yearsBack + 1 }, (_, i) => currentYear - i).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
