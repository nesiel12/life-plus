// The empty stretches between a day's real events.
//
// The calendar grid used to render those stretches as blank white rows. They
// are not nothing — they are the time the user actually has — so this finds
// them as real intervals the day view can fill with a "you're free here"
// affordance and, when something is waiting, a concrete suggestion.
//
// Pure minute arithmetic, mirroring lib/schedule/routine.ts's freeWindows:
// merge the busy set first (calendar events overlap constantly — an all-hands
// inside a focus block), then walk the gaps between merged intervals.

export interface DayGap {
  /** Minutes since local midnight. */
  startMinute: number;
  endMinute: number;
  durationMinutes: number;
}

interface BusyInput {
  /** ISO instant. */
  start: string;
  end: string;
}

function minutesSinceMidnight(iso: string): number {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return NaN;
  return d.getHours() * 60 + d.getMinutes();
}

export interface FindDayGapsOptions {
  /** Window start, minutes since midnight — matches the grid's first hour. */
  fromMinute: number;
  /** Window end, minutes since midnight — matches the grid's last hour. */
  toMinute: number;
  /**
   * When set, gaps ending before this minute are dropped and a gap straddling
   * it is trimmed to start here. Pass the current time for today so the view
   * never suggests filling an hour that has already passed.
   */
  nowMinute?: number;
  /** Shortest gap worth showing. A 20-minute hole is not actionable. */
  minDurationMinutes?: number;
}

/**
 * Free intervals inside [fromMinute, toMinute), after merging the busy set.
 * Timed events only — callers filter all-day events out before passing them,
 * since an all-day event does not occupy any clock hour.
 */
export function findDayGaps(events: BusyInput[], options: FindDayGapsOptions): DayGap[] {
  const { fromMinute, toMinute } = options;
  const floor = options.nowMinute != null ? Math.max(fromMinute, options.nowMinute) : fromMinute;
  const minDuration = options.minDurationMinutes ?? 45;
  if (toMinute <= floor) return [];

  const busy = events
    .map((e) => ({ start: minutesSinceMidnight(e.start), end: minutesSinceMidnight(e.end) }))
    .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end) && b.end > b.start)
    .map((b) => ({ start: Math.max(b.start, floor), end: Math.min(b.end, toMinute) }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);

  const merged: { start: number; end: number }[] = [];
  for (const interval of busy) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }

  const gaps: DayGap[] = [];
  let cursor = floor;
  for (const interval of merged) {
    if (interval.start - cursor >= minDuration) {
      gaps.push({
        startMinute: cursor,
        endMinute: interval.start,
        durationMinutes: interval.start - cursor,
      });
    }
    cursor = Math.max(cursor, interval.end);
  }
  if (toMinute - cursor >= minDuration) {
    gaps.push({ startMinute: cursor, endMinute: toMinute, durationMinutes: toMinute - cursor });
  }

  return gaps;
}
