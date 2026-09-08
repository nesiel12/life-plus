// The genuinely free stretches in a day.
//
// The calendar grid used to render the space between Google Calendar events
// as blank white rows. That space is not nothing — it is the time the user
// actually has — but "no calendar event here" is not the same as "free": a
// weekday with a 09:00–17:00 work block in the routine is not free all
// morning just because nothing was put on the Google calendar.
//
// So the busy set is the union of two things: timed calendar events, and the
// user's own recurring routine blocks for that weekday (except the ones they
// named "free"). Gaps are what is left. Pure minute arithmetic — merge the
// busy set first (things overlap constantly), then walk the holes.

export interface DayGap {
  /** Minutes since local midnight. */
  startMinute: number;
  endMinute: number;
  durationMinutes: number;
}

interface BusyEventInput {
  /** ISO instant. */
  start: string;
  end: string;
}

export interface BusyBlockInput {
  /** Minutes since local midnight. */
  startMinute: number;
  endMinute: number;
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
  /**
   * Recurring routine blocks for this weekday, already in minutes and already
   * filtered to the ones that make the user unavailable (work, study,
   * commute, …) — not "free" blocks. Merged into the busy set so a gap is
   * time that is free of *both* calendar events and the routine.
   */
  busyBlocks?: BusyBlockInput[];
  /**
   * Longest a single trailing "rest of the day is open" gap should be. A
   * six-hour band after the last meeting is not information; cap it so the
   * line stays near where the day actually opens up.
   */
  maxGapMinutes?: number;
}

/**
 * Free intervals inside [fromMinute, toMinute) after merging calendar events
 * and busy routine blocks. Timed events only — callers filter all-day events
 * out first, since an all-day event occupies no clock hour.
 *
 * Returns [] when there is no structure at all (no events and no busy
 * blocks): a completely empty day does not need a 16-hour "you are free"
 * band drawn down it.
 */
export function findDayGaps(events: BusyEventInput[], options: FindDayGapsOptions): DayGap[] {
  const { fromMinute, toMinute } = options;
  const floor = options.nowMinute != null ? Math.max(fromMinute, options.nowMinute) : fromMinute;
  const minDuration = options.minDurationMinutes ?? 45;
  const maxGap = options.maxGapMinutes ?? 5 * 60;
  if (toMinute <= floor) return [];

  const eventIntervals = events
    .map((e) => ({ start: minutesSinceMidnight(e.start), end: minutesSinceMidnight(e.end) }))
    .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end) && b.end > b.start);

  const blockIntervals = (options.busyBlocks ?? [])
    .map((b) => ({ start: b.startMinute, end: b.endMinute }))
    .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end) && b.end > b.start);

  // Nothing scheduled and no routine for the day → no gaps to draw.
  if (eventIntervals.length === 0 && blockIntervals.length === 0) return [];

  const busy = [...eventIntervals, ...blockIntervals]
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

  // With no busy interval left after clamping (everything is in the past, or
  // outside the window) there is no anchor to hang a gap off — the "rest of
  // today is open" case, which the day view says better with nothing.
  if (merged.length === 0) return [];

  const gaps: DayGap[] = [];
  let cursor = floor;
  const pushGap = (start: number, end: number) => {
    const clippedEnd = Math.min(end, start + maxGap);
    if (clippedEnd - start >= minDuration) {
      gaps.push({ startMinute: start, endMinute: clippedEnd, durationMinutes: clippedEnd - start });
    }
  };

  for (const interval of merged) {
    if (interval.start - cursor >= minDuration) pushGap(cursor, interval.start);
    cursor = Math.max(cursor, interval.end);
  }
  // Trailing gap only when the day had structure that has now ended before
  // the window closes — capped by maxGap so it does not run to 23:00.
  if (cursor < toMinute) pushGap(cursor, toMinute);

  return gaps;
}
