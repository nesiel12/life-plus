"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

// Day + month pickers for the annual dates the app stores as "MM-DD"
// (birthdays, anniversaries). Replaces a free-text field that silently
// rejected anything that was not exactly "05-14" — most people typed
// "14/5" or "May 14" and got nothing saved.
//
// No year: the stored format has none, and these dates recur annually. The
// day list is a fixed 31 rather than month-aware — picking 31 in February
// then changing the month is a worse interaction than an occasional invalid
// pair, which onChange clamps anyway.

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

function toValue(month: number, day: number): string {
  const clampedDay = Math.min(day, DAYS_IN_MONTH[month - 1]);
  return `${String(month).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
}

interface MonthDayPickerProps {
  /** "MM-DD" or "". */
  value: string;
  /** Emits "MM-DD" once both fields are set, or "" when either is cleared. */
  onChange: (value: string) => void;
  idPrefix?: string;
  className?: string;
  ariaLabel?: string;
}

export function MonthDayPicker({ value, onChange, idPrefix, className, ariaLabel }: MonthDayPickerProps) {
  const reactId = useId();
  const base = idPrefix ?? reactId;
  const { month, day } = parseMonthDay(value);

  const selectClass =
    "focus-ring rounded-lg bg-fill-subtle px-2.5 py-2 text-sm text-foreground";

  function update(nextMonth: number | null, nextDay: number | null) {
    if (nextMonth && nextDay) onChange(toValue(nextMonth, nextDay));
    else onChange("");
  }

  return (
    <div
      className={cn("flex items-center gap-2", className)}
      role="group"
      aria-label={ariaLabel ?? "תאריך"}
    >
      <select
        id={`${base}-day`}
        aria-label="יום"
        value={day ?? ""}
        onChange={(e) => update(month, e.target.value ? Number(e.target.value) : null)}
        className={selectClass}
      >
        <option value="">יום</option>
        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <select
        id={`${base}-month`}
        aria-label="חודש"
        value={month ?? ""}
        onChange={(e) => update(e.target.value ? Number(e.target.value) : null, day)}
        className={cn(selectClass, "flex-1")}
      >
        <option value="">חודש</option>
        {HEBREW_MONTHS.map((name, i) => (
          <option key={name} value={i + 1}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );
}
