// Geometry for a day column of a time grid.
//
// The hard part of a week or day grid is not placing one event — it is
// placing two that overlap. Without this they draw on top of each other and
// the later one simply hides the earlier, which is the specific way a
// calendar view lies: the meeting is on the calendar, and it is invisible.
//
// Events are grouped into clusters of mutually-overlapping items and each
// cluster is split into side-by-side columns. Pure, so the cluster and
// column arithmetic is verified without rendering anything.

export interface TimeSpan {
  /** Minutes from the start of the grid. */
  startMinute: number;
  endMinute: number;
}

export interface PlacedEvent<T> {
  event: T;
  /** Fractions of the column's height, 0 at the top of the grid. */
  top: number;
  height: number;
  /** Which of `columns` side-by-side slots this event occupies. */
  column: number;
  columns: number;
}

/** Below this an event is a hairline nobody can read or click. */
const MIN_HEIGHT_FRACTION = 0.012;

/**
 * Places events within a grid spanning [gridStart, gridEnd) minutes.
 *
 * Events are clipped to the grid rather than dropped: a meeting that started
 * before the visible window still needs to show, or the column reads as free
 * when it is not.
 */
export function layoutDayEvents<T>(
  events: T[],
  span: (event: T) => TimeSpan,
  gridStart: number,
  gridEnd: number
): PlacedEvent<T>[] {
  const total = gridEnd - gridStart;
  if (total <= 0) return [];

  const visible = events
    .map((event) => {
      const { startMinute, endMinute } = span(event);
      return {
        event,
        start: Math.max(startMinute, gridStart),
        end: Math.min(Math.max(endMinute, startMinute + 1), gridEnd),
      };
    })
    .filter((item) => item.end > gridStart && item.start < gridEnd)
    // Earliest first, then longest first — so the event that spans the
    // cluster takes the leading column rather than being pushed to the edge
    // by a short one that happens to start at the same minute.
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const placed: PlacedEvent<T>[] = [];

  // Walk in order, accumulating a cluster while anything still overlaps it.
  let cluster: typeof visible = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (cluster.length === 0) return;

    // Greedy column packing: an event reuses the first column whose last
    // event has already finished. Two events that merely touch (one ends
    // exactly when the next begins) share a column rather than splitting the
    // width for no reason.
    const columnEnds: number[] = [];
    const assigned = cluster.map((item) => {
      let column = columnEnds.findIndex((end) => end <= item.start);
      if (column === -1) {
        column = columnEnds.length;
        columnEnds.push(item.end);
      } else {
        columnEnds[column] = item.end;
      }
      return { item, column };
    });

    const columns = columnEnds.length;
    for (const { item, column } of assigned) {
      const top = (item.start - gridStart) / total;
      placed.push({
        event: item.event,
        top,
        height: Math.max((item.end - item.start) / total, MIN_HEIGHT_FRACTION),
        column,
        columns,
      });
    }

    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const item of visible) {
    if (cluster.length > 0 && item.start >= clusterEnd) flush();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  flush();

  return placed;
}

/** Minutes from local midnight, for an instant on a given day. */
export function minutesIntoDay(instant: Date): number {
  return instant.getHours() * 60 + instant.getMinutes();
}
