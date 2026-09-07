// The daily-schedule engine: pure arithmetic over recurring weekly blocks.
//
// No Date construction, no timezone lookups, no DB. Callers resolve "what
// weekday is it and how many minutes into the day are we, in the user's
// timezone" once, and everything here is integer maths on that. This is what
// lets the same logic serve the dashboard card, the weekly editor, and the
// transition-alert job without three subtly different notions of "now".

export type RoutineKind =
  | "work"
  | "study"
  | "torah"
  | "training"
  | "rest"
  | "meal"
  | "commute"
  | "family"
  | "free"
  | "other";

export interface RoutineBlock {
  id: string;
  title: string;
  kind: RoutineKind;
  /** Sunday = 0, matching Date.getDay(). */
  weekdays: number[];
  /** Minutes since local midnight. */
  startMinute: number;
  /** Minutes since local midnight; may be 1440. Always > startMinute. */
  endMinute: number;
  note?: string;
  isActive: boolean;
}

export const ROUTINE_KIND_LABELS: Record<RoutineKind, string> = {
  work: "עבודה",
  study: "לימודים",
  torah: "תורה",
  training: "אימון",
  rest: "מנוחה",
  meal: "ארוחה",
  commute: "נסיעה",
  family: "משפחה",
  free: "זמן פנוי",
  other: "אחר",
};

/** Maps each kind onto an existing life-area accent token (app/globals.css). */
export const ROUTINE_KIND_COLOR_VAR: Record<RoutineKind, string> = {
  work: "--accent-career",
  study: "--accent-learning",
  torah: "--accent-faith",
  training: "--accent-health",
  rest: "--accent-time",
  meal: "--accent-health",
  commute: "--muted",
  family: "--accent-family",
  free: "--gold",
  other: "--muted",
};

export const WEEKDAY_LABELS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
export const WEEKDAY_INITIALS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

export const MINUTES_IN_DAY = 1440;

/** "HH:MM" from minutes since midnight. 1440 renders as 24:00, not 00:00. */
export function formatMinute(minute: number): string {
  const clamped = Math.max(0, Math.min(MINUTES_IN_DAY, Math.round(minute)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Minutes since midnight from "HH:MM" / "H:MM". Null when unparseable. */
export function parseMinute(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 24 || m > 59) return null;
  const total = h * 60 + m;
  return total > MINUTES_IN_DAY ? null : total;
}

/** A human duration: "45 דק׳", "שעה", "2:30 שע׳". */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} דק׳`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (m === 0) return h === 1 ? "שעה" : `${h} שעות`;
  return `${h}:${String(m).padStart(2, "0")} שע׳`;
}

/** Active blocks that fall on `weekday`, in start order. */
export function blocksForDay(blocks: RoutineBlock[], weekday: number): RoutineBlock[] {
  return blocks
    .filter((b) => b.isActive && b.weekdays.includes(weekday))
    .sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);
}

/**
 * The block containing `minute`, if any.
 *
 * Half-open [start, end): a block ending at 10:00 and one starting at 10:00
 * do not both claim 10:00. When blocks genuinely overlap, the one that
 * started most recently wins — that is the one you most recently moved into.
 */
export function currentBlock(
  blocks: RoutineBlock[],
  weekday: number,
  minute: number
): RoutineBlock | null {
  const active = blocksForDay(blocks, weekday).filter(
    (b) => minute >= b.startMinute && minute < b.endMinute
  );
  return active.length > 0 ? active[active.length - 1] : null;
}

export interface UpcomingBlock {
  block: RoutineBlock;
  /** Minutes from now until it starts. */
  minutesUntil: number;
  /** True when it starts tomorrow rather than later today. */
  isTomorrow: boolean;
}

/**
 * The next block that starts strictly after `minute`.
 *
 * Rolls into tomorrow when today has nothing left, because "nothing else
 * today" and "nothing at all" are different answers and only one of them is
 * usually true. `nextWeekday` is passed in rather than computed so this stays
 * free of Date and of any assumption about the week wrapping.
 */
export function nextBlock(
  blocks: RoutineBlock[],
  weekday: number,
  minute: number,
  nextWeekday: number
): UpcomingBlock | null {
  const laterToday = blocksForDay(blocks, weekday).find((b) => b.startMinute > minute);
  if (laterToday) {
    return { block: laterToday, minutesUntil: laterToday.startMinute - minute, isTomorrow: false };
  }

  const tomorrow = blocksForDay(blocks, nextWeekday)[0];
  if (!tomorrow) return null;
  return {
    block: tomorrow,
    minutesUntil: MINUTES_IN_DAY - minute + tomorrow.startMinute,
    isTomorrow: true,
  };
}

export interface FreeWindow {
  startMinute: number;
  endMinute: number;
  durationMinutes: number;
}

/**
 * The gaps in a day's schedule, merged.
 *
 * Blocks may overlap, and a naive pairwise gap walk would invent free time
 * inside an overlap (block A 09:00-12:00 and block B 10:00-11:00 would
 * "leave" 12:00 free after B). Merging the busy intervals first is what makes
 * the result trustworthy enough to schedule against.
 *
 * `free`-kind blocks are deliberately excluded from the busy set: protected
 * time is free time the user has named, not an obligation.
 */
export function freeWindows(
  blocks: RoutineBlock[],
  weekday: number,
  options: { fromMinute?: number; toMinute?: number; minDurationMinutes?: number } = {}
): FreeWindow[] {
  const from = options.fromMinute ?? 0;
  const to = options.toMinute ?? MINUTES_IN_DAY;
  const minDuration = options.minDurationMinutes ?? 15;
  if (to <= from) return [];

  const busy = blocksForDay(blocks, weekday)
    .filter((b) => b.kind !== "free")
    .map((b) => ({ start: Math.max(b.startMinute, from), end: Math.min(b.endMinute, to) }))
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

  const windows: FreeWindow[] = [];
  let cursor = from;
  for (const interval of merged) {
    if (interval.start - cursor >= minDuration) {
      windows.push({
        startMinute: cursor,
        endMinute: interval.start,
        durationMinutes: interval.start - cursor,
      });
    }
    cursor = Math.max(cursor, interval.end);
  }
  if (to - cursor >= minDuration) {
    windows.push({ startMinute: cursor, endMinute: to, durationMinutes: to - cursor });
  }

  return windows;
}

export interface NowNext {
  current: RoutineBlock | null;
  /** Minutes left in the current block. Null when nothing is running. */
  minutesRemaining: number | null;
  next: UpcomingBlock | null;
  /** The next free stretch from now onward, today. */
  nextFreeWindow: FreeWindow | null;
}

/** Everything the "now / next" card needs, in one pass. */
export function nowNext(
  blocks: RoutineBlock[],
  weekday: number,
  minute: number,
  nextWeekday: number
): NowNext {
  const current = currentBlock(blocks, weekday, minute);
  return {
    current,
    minutesRemaining: current ? current.endMinute - minute : null,
    next: nextBlock(blocks, weekday, minute, nextWeekday),
    nextFreeWindow: freeWindows(blocks, weekday, { fromMinute: minute, minDurationMinutes: 30 })[0] ?? null,
  };
}

/**
 * Blocks starting exactly `leadMinutes` from now, within a sweep-width window.
 *
 * `windowMinutes` exists because a scheduler does not fire on the second. A
 * sweep every 15 minutes must catch a transition whose alert moment fell
 * anywhere in the interval since the last run, or alerts are missed entirely
 * — and it must not re-catch one already sent, which is what the job's
 * dedupe key handles.
 */
export function transitionsDue(
  blocks: RoutineBlock[],
  weekday: number,
  minute: number,
  leadMinutes: number,
  windowMinutes: number
): RoutineBlock[] {
  if (leadMinutes <= 0) return [];
  const from = minute + leadMinutes;
  const to = from + windowMinutes;
  return blocksForDay(blocks, weekday).filter(
    (b) => b.startMinute >= from && b.startMinute < to
  );
}

/** Total scheduled minutes on a day, overlaps counted once. */
export function bookedMinutes(blocks: RoutineBlock[], weekday: number): number {
  const free = freeWindows(blocks, weekday, { minDurationMinutes: 1 });
  const freeTotal = free.reduce((sum, w) => sum + w.durationMinutes, 0);
  return MINUTES_IN_DAY - freeTotal;
}
