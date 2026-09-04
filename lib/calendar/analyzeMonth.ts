import { dayPartForHour, dayPartLabel } from "@/lib/onboarding/chronotype";
import { energyForHour } from "@/lib/calendar/energy";
import type { ChronotypeSettings, DayPart } from "@/types";

// Monthly time/lifestyle analysis.
//
// Same division of labour the whole codebase holds to (see
// lib/finances/analyze.ts and lib/calendar/findFocusSlots.ts): every number
// here is computed, never asked of a model. "You spent 31% of your scheduled
// hours in your low-energy window" is only worth saying if it's actually
// true, and an LLM asked to total hours from a list produces a confident,
// subtly wrong figure.

export interface MonthEvent {
  title: string;
  start: string; // ISO
  end: string; // ISO
  isAllDay?: boolean;
}

export interface DayPartLoad {
  part: DayPart;
  label: string;
  hours: number;
  /** Share of total scheduled hours, 0-1. */
  share: number;
}

export interface WeekdayLoad {
  /** 0 = Sunday, matching Date.getDay(). */
  weekday: number;
  label: string;
  hours: number;
  eventCount: number;
}

export interface MonthAnalysis {
  month: string; // YYYY-MM
  eventCount: number;
  allDayCount: number;
  /** Total scheduled hours, timed events only. */
  totalHours: number;
  /** Mean hours across days that actually had something scheduled. */
  averageHoursPerActiveDay: number;
  activeDays: number;
  busiestDay: { date: string; hours: number } | null;
  byDayPart: DayPartLoad[];
  byWeekday: WeekdayLoad[];
  /** Hours landing in the user's own peak-focus window. Null with no chronotype. */
  peakHours: number | null;
  /** Hours landing in the user's own low-energy window. Null with no chronotype. */
  lowEnergyHours: number | null;
  /** The longest run of consecutive days with nothing scheduled. */
  longestFreeStreakDays: number;
}

const HEBREW_WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Days in `month` ("YYYY-MM"). */
function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

/**
 * Analyses one calendar month.
 *
 * All-day events are counted but contribute no hours: they have no real
 * duration, and folding them in as 24h each would swamp every other figure
 * and make "total scheduled hours" a number the user couldn't recognise.
 *
 * An event is attributed to the day-part and energy band of the hour it
 * *starts* in, rather than being split across bands. Splitting would be more
 * precise on paper, but a 09:00–13:00 block genuinely belongs to the morning
 * in how a person experiences their day, and the split version reports
 * fractions nobody recognises.
 */
export function analyzeMonth(
  month: string,
  events: MonthEvent[],
  chronotype: ChronotypeSettings = {}
): MonthAnalysis {
  const timed = events.filter((e) => !e.isAllDay);
  const allDayCount = events.length - timed.length;

  const hoursByDay = new Map<string, number>();
  const hoursByPart = new Map<DayPart, number>();
  const weekdayHours = new Map<number, number>();
  const weekdayCounts = new Map<number, number>();
  let totalHours = 0;
  let peakHours = 0;
  let lowEnergyHours = 0;

  const hasChronotype = Boolean(
    chronotype.peakFocusHours?.length || chronotype.lowEnergyHours?.length || chronotype.wakeTime || chronotype.sleepTime
  );

  for (const event of timed) {
    const start = new Date(event.start);
    const end = new Date(event.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;

    const hours = (end.getTime() - start.getTime()) / 3_600_000;
    // Guard inverted or zero-length events rather than letting a negative
    // duration quietly subtract from the totals.
    if (!(hours > 0)) continue;

    totalHours += hours;

    const key = dateKey(start);
    hoursByDay.set(key, (hoursByDay.get(key) ?? 0) + hours);

    const weekday = start.getDay();
    weekdayHours.set(weekday, (weekdayHours.get(weekday) ?? 0) + hours);
    weekdayCounts.set(weekday, (weekdayCounts.get(weekday) ?? 0) + 1);

    const part = dayPartForHour(start.getHours());
    if (part) hoursByPart.set(part, (hoursByPart.get(part) ?? 0) + hours);

    if (hasChronotype) {
      const energy = energyForHour(start.getHours(), chronotype);
      if (energy === "peak") peakHours += hours;
      else if (energy === "low") lowEnergyHours += hours;
    }
  }

  const byDayPart: DayPartLoad[] = [...hoursByPart.entries()]
    .map(([part, hours]) => ({
      part,
      label: dayPartLabel(part),
      hours: round1(hours),
      share: totalHours > 0 ? hours / totalHours : 0,
    }))
    .sort((a, b) => b.hours - a.hours);

  const byWeekday: WeekdayLoad[] = [...Array(7).keys()]
    .map((weekday) => ({
      weekday,
      label: HEBREW_WEEKDAYS[weekday],
      hours: round1(weekdayHours.get(weekday) ?? 0),
      eventCount: weekdayCounts.get(weekday) ?? 0,
    }))
    .filter((d) => d.eventCount > 0)
    .sort((a, b) => b.hours - a.hours);

  let busiestDay: MonthAnalysis["busiestDay"] = null;
  for (const [date, hours] of hoursByDay) {
    if (!busiestDay || hours > busiestDay.hours) busiestDay = { date, hours: round1(hours) };
  }

  // Longest run of days in the month with nothing scheduled at all.
  const total = daysInMonth(month);
  let longestFreeStreakDays = 0;
  let run = 0;
  for (let day = 1; day <= total; day++) {
    const key = `${month}-${String(day).padStart(2, "0")}`;
    if (hoursByDay.has(key)) {
      run = 0;
    } else {
      run += 1;
      if (run > longestFreeStreakDays) longestFreeStreakDays = run;
    }
  }

  const activeDays = hoursByDay.size;

  return {
    month,
    eventCount: events.length,
    allDayCount,
    totalHours: round1(totalHours),
    averageHoursPerActiveDay: activeDays > 0 ? round1(totalHours / activeDays) : 0,
    activeDays,
    busiestDay,
    byDayPart,
    byWeekday,
    peakHours: hasChronotype ? round1(peakHours) : null,
    lowEnergyHours: hasChronotype ? round1(lowEnergyHours) : null,
    longestFreeStreakDays,
  };
}
