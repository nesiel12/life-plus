// Per-day completion counts for the Momentum Dashboard's contribution
// heatmap — same shape and same reasoning as lib/calendar/yearDensity.ts:
// pure, tested, and computed from the two completion ledgers (task_completions,
// habit_logs) rather than shipping every task/habit row to the client to be
// counted there.
//
// No AI anywhere in this file, or anywhere else in lib/gamification/ — every
// number is arithmetic over rows the user actually produced.

export interface DatedCompletion {
  /** Local "YYYY-MM-DD", as stored in task_completions.completed_date /
   *  habit_logs.completed_date — already a plain date, no timezone math
   *  needed at this layer. */
  completedDate: string;
}

/**
 * Counts tasks-finished-plus-habits-checked-in per local day.
 *
 * Days with nothing are absent rather than zero — a year of explicit zeros
 * is most of the payload this exists to avoid (same call yearDensity makes).
 */
export function countCompletionsByDay(
  taskCompletions: readonly DatedCompletion[],
  habitCompletions: readonly DatedCompletion[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const { completedDate } of taskCompletions) {
    counts[completedDate] = (counts[completedDate] ?? 0) + 1;
  }
  for (const { completedDate } of habitCompletions) {
    counts[completedDate] = (counts[completedDate] ?? 0) + 1;
  }
  return counts;
}

/** Every distinct day with at least one completion, ascending — the streak
 *  engine's raw input. */
export function activeDatesFrom(
  taskCompletions: readonly DatedCompletion[],
  habitCompletions: readonly DatedCompletion[]
): string[] {
  const counts = countCompletionsByDay(taskCompletions, habitCompletions);
  return Object.keys(counts).sort();
}

/** Busiest single day in a count map, for scaling the heat ramp. Same
 *  definition as lib/calendar/yearDensity.ts's peakCount. */
export function peakCount(counts: Record<string, number>): number {
  let peak = 0;
  for (const value of Object.values(counts)) {
    if (value > peak) peak = value;
  }
  return peak;
}

/** Four filled bands plus empty — GitHub's own contribution graph uses the
 *  same count, and more stops being distinguishable at square-cell size. */
export const HEAT_STEPS = 4;

/**
 * Which heat band a day falls in, 0 (empty) to HEAT_STEPS.
 *
 * Scaled against the *user's own* busiest day rather than a fixed threshold —
 * "three tasks" is a huge day for someone who logs one a week and a quiet one
 * for someone who logs ten, and a fixed scale would flatten one of those two
 * into a uniform color.
 */
export function heatLevel(count: number, peak: number): number {
  if (count <= 0 || peak <= 0) return 0;
  return Math.min(HEAT_STEPS, Math.ceil((count / peak) * HEAT_STEPS));
}
