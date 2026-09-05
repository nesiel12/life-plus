import { dateKey } from "@/lib/calendar/ranges";

// Per-day event counts for the year heat grid.
//
// Pure and tested, and computed on the server so the year view ships ~366
// numbers instead of a year of event objects with titles and timestamps.
//
// The one real decision here is what a multi-day event counts as. It counts
// on every day it covers, not just the day it starts: the grid answers "was
// this day occupied", and a five-day trip that darkens one square and leaves
// the next four blank answers it wrongly.

export interface DensityEvent {
  start: string;
  end: string;
  isAllDay: boolean;
}

/** Local midnight of the day containing an instant, or of a "YYYY-MM-DD". */
function dayStart(value: string, isAllDay: boolean): Date | null {
  if (isAllDay) {
    // An all-day value is a plain date. `new Date("2026-09-06")` parses as
    // UTC midnight, which is the *previous* day for anyone west of
    // Greenwich, so the parts are read directly instead.
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  return new Date(at.getFullYear(), at.getMonth(), at.getDate());
}

/**
 * Counts events per local day across [from, to).
 *
 * Days with no events are absent rather than zero — a year of explicit zeros
 * is most of the payload this exists to avoid.
 */
export function countEventsByDay(
  events: DensityEvent[],
  from: Date,
  to: Date
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const event of events) {
    const start = dayStart(event.start, event.isAllDay);
    if (!start) continue;

    const rawEnd = dayStart(event.end, event.isAllDay);
    // An all-day event's end date is exclusive; a timed one's is an instant
    // on the last day it touches. Both reduce to "last day covered".
    let last = rawEnd ?? start;
    if (event.isAllDay && rawEnd) {
      last = new Date(rawEnd.getFullYear(), rawEnd.getMonth(), rawEnd.getDate() - 1);
    }
    if (last < start) last = start;

    // Walk day by day with the local-date constructor rather than adding
    // 86_400_000, which drifts by an hour across a DST boundary and can
    // repeat or skip a day.
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    // A malformed event claiming a decade must not spin this loop; the
    // window itself is the bound.
    while (cursor <= last && cursor < to) {
      if (cursor >= from) {
        const key = dateKey(cursor);
        counts[key] = (counts[key] ?? 0) + 1;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return counts;
}

/** Busiest single day in a count map, for scaling the heat ramp. */
export function peakCount(counts: Record<string, number>): number {
  let peak = 0;
  for (const value of Object.values(counts)) {
    if (value > peak) peak = value;
  }
  return peak;
}
