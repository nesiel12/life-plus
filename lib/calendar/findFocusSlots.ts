import { energyForHour, isAsleepAt } from "@/lib/calendar/energy";
import type { ChronotypeSettings } from "@/types";

// Finds the gaps in a day where focused work would actually land well, ranked
// by the user's own energy curve. This is the engine behind "the AI suggests
// putting this task at 09:00" — it does the arithmetic so the model only has
// to choose among genuinely free, genuinely good windows, rather than being
// trusted to do interval maths in its head (which is where LLMs invent
// overlapping or 3am meetings).

export interface Interval {
  /** ISO 8601 with offset. */
  start: string;
  end: string;
}

export interface FocusSlot {
  start: string;
  end: string;
  /** Whole minutes. */
  durationMinutes: number;
  /** Energy at the slot's starting hour. */
  energy: "peak" | "neutral";
  /** Higher is better. Peak-energy and longer slots score higher. */
  score: number;
}

const MS_PER_MINUTE = 60_000;

function toMinutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** Merges overlapping/adjacent intervals so gap-finding sees a clean line. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const valid = intervals
    .map((i) => ({ start: new Date(i.start).getTime(), end: new Date(i.end).getTime() }))
    .filter((i) => Number.isFinite(i.start) && Number.isFinite(i.end) && i.end > i.start)
    .sort((a, b) => a.start - b.start);

  const merged: { start: number; end: number }[] = [];
  for (const current of valid) {
    const last = merged[merged.length - 1];
    if (last && current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }
  return merged.map((i) => ({
    start: new Date(i.start).toISOString(),
    end: new Date(i.end).toISOString(),
  }));
}

interface FindOptions {
  /** The day to search, as a Date anywhere within it. */
  day: Date;
  busy: Interval[];
  chronotype: ChronotypeSettings;
  /** Shortest slot worth proposing. */
  minDurationMinutes?: number;
  /** Slots ending before this are skipped — pass "now" so today's past isn't proposed. */
  notBefore?: Date;
  maxResults?: number;
}

/**
 * Free windows on `day`, excluding busy intervals and sleep, ranked so the
 * user's peak-focus hours come first. Low-energy hours are excluded outright:
 * the whole point is to protect deep work, and proposing a trough slot for it
 * would be worse than proposing nothing.
 */
export function findFocusSlots({
  day,
  busy,
  chronotype,
  minDurationMinutes = 30,
  notBefore,
  maxResults = 5,
}: FindOptions): FocusSlot[] {
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);

  // Walk the day in 30-minute steps and keep the runs that are free, awake and
  // not in a low-energy trough. Stepping beats interval subtraction here
  // because energy changes on hour boundaries, so a run has to break when the
  // banding does — not just when an event does.
  const STEP = 30;
  const merged = mergeIntervals(busy).map((i) => ({
    start: new Date(i.start).getTime(),
    end: new Date(i.end).getTime(),
  }));
  const floor = notBefore ? notBefore.getTime() : -Infinity;

  const usable: { minute: number; energy: "peak" | "neutral" }[] = [];
  for (let minute = 0; minute < 24 * 60; minute += STEP) {
    const slotStart = new Date(dayStart.getTime() + minute * MS_PER_MINUTE);
    const slotEnd = new Date(slotStart.getTime() + STEP * MS_PER_MINUTE);
    if (slotEnd.getTime() <= floor) continue;
    if (isAsleepAt(toMinutesOfDay(slotStart), chronotype)) continue;

    const energy = energyForHour(slotStart.getHours(), chronotype);
    if (energy === "low" || energy === "asleep") continue;

    const overlapsBusy = merged.some(
      (b) => slotStart.getTime() < b.end && slotEnd.getTime() > b.start
    );
    if (overlapsBusy) continue;

    usable.push({ minute, energy: energy === "peak" ? "peak" : "neutral" });
  }

  // Coalesce contiguous steps that share an energy band into one slot.
  const slots: FocusSlot[] = [];
  let run: { startMinute: number; endMinute: number; energy: "peak" | "neutral" } | null = null;
  const flush = () => {
    if (!run) return;
    const duration = run.endMinute - run.startMinute;
    if (duration >= minDurationMinutes) {
      const start = new Date(dayStart.getTime() + run.startMinute * MS_PER_MINUTE);
      const end = new Date(dayStart.getTime() + run.endMinute * MS_PER_MINUTE);
      slots.push({
        start: start.toISOString(),
        end: end.toISOString(),
        durationMinutes: duration,
        energy: run.energy,
        // Peak dominates duration: a 30-minute peak window is a better home
        // for deep work than a two-hour neutral one.
        score: (run.energy === "peak" ? 1000 : 0) + duration,
      });
    }
    run = null;
  };

  for (const step of usable) {
    if (run && run.endMinute === step.minute && run.energy === step.energy) {
      run.endMinute += STEP;
    } else {
      flush();
      run = { startMinute: step.minute, endMinute: step.minute + STEP, energy: step.energy };
    }
  }
  flush();

  return slots.sort((a, b) => b.score - a.score || a.start.localeCompare(b.start)).slice(0, maxResults);
}

const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;
const MAX_HORIZON_DAYS = 21; // a hard ceiling — an undated task must not walk forever

interface FindAcrossDaysOptions {
  /** Search starts on this day (inclusive). Typically "now". */
  from: Date;
  /** Search ends on this day (inclusive) — e.g. a task's due date. */
  until: Date;
  busy: Interval[];
  chronotype: ChronotypeSettings;
  minDurationMinutes?: number;
  maxResults?: number;
}

/**
 * The task-scheduling entry point (Sprint 5): "put this task somewhere
 * before it's due" needs a range, not one day. Deterministic for the same
 * reason findFocusSlots itself is (see the module header) — this only walks
 * calendar days and delegates every day's actual slot-finding to
 * findFocusSlots, it never asks the model to reason about free time.
 *
 * `from`/`until` are calendar days, not instants — a due date is a day
 * boundary, not a specific hour, so "until" is inclusive of its whole day.
 * `until` before `from` (an overdue task) returns no slots rather than
 * throwing, matching findFocusSlots' own precedent of never proposing a slot
 * in the past.
 */
export function findFocusSlotsAcrossDays({
  from,
  until,
  busy,
  chronotype,
  minDurationMinutes = 30,
  maxResults = 5,
}: FindAcrossDaysOptions): FocusSlot[] {
  const dayStart = new Date(from);
  dayStart.setHours(0, 0, 0, 0);
  const lastDay = new Date(until);
  lastDay.setHours(0, 0, 0, 0);

  const spanDays = Math.round((lastDay.getTime() - dayStart.getTime()) / MS_PER_DAY);
  if (spanDays < 0) return [];

  const results: FocusSlot[] = [];
  for (let offset = 0; offset <= Math.min(spanDays, MAX_HORIZON_DAYS); offset++) {
    const day = new Date(dayStart.getTime() + offset * MS_PER_DAY);
    results.push(
      ...findFocusSlots({
        day,
        busy,
        chronotype,
        minDurationMinutes,
        // Only the first day needs a floor — every later day is entirely in
        // the future relative to `from`.
        notBefore: offset === 0 ? from : undefined,
        maxResults, // each day is already capped; the merge below re-caps overall
      })
    );
  }

  return results.sort((a, b) => b.score - a.score || a.start.localeCompare(b.start)).slice(0, maxResults);
}

/** True when [start, end) overlaps any busy interval. */
export function hasConflict(start: string, end: string, busy: Interval[]): boolean {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e)) return false;
  return mergeIntervals(busy).some(
    (b) => s < new Date(b.end).getTime() && e > new Date(b.start).getTime()
  );
}
