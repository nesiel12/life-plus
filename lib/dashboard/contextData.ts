import { parseHour } from "@/lib/health/energyCurve";
import {
  buildDailyTimelineRows,
  timelineRowTitle,
  type WeekCalendarEvent,
} from "@/lib/time/buildDailyTimeline";
import type { Goal, ManualEvent, Meal, Milestone, Task, Transaction, Workout } from "@/types";

// The data the context band's cards read, as pure functions. The cards
// themselves are thin: everything that could be wrong (which goal is "next",
// how long until bed, what counts as tomorrow) lives here where it is tested.

/** Local calendar day as "YYYY-MM-DD" — the user's own day, not UTC's. */
export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// --- Top three goals ---------------------------------------------------------

export interface GoalFocus {
  goal: Goal;
  /** The milestone to do next. */
  next: Milestone;
  /** Milestones still open, including `next`. */
  remaining: number;
}

const byDate = (a?: string, b?: string): number => {
  if (a && b) return a.localeCompare(b);
  if (a) return -1;
  if (b) return 1;
  return 0;
};

/**
 * "What are my three most pressing goals, and what is the next step on each."
 *
 * Only goals with an open milestone count — a finished goal has nothing to do
 * today. The next step is the earliest-dated open milestone (undated ones keep
 * their listed order, after the dated). Goals are ranked by how soon that next
 * step falls due, then by their own target date, then by age, so the list is
 * stable from one render to the next.
 */
export function pickTopGoals(goals: readonly Goal[], limit = 3): GoalFocus[] {
  const focus: GoalFocus[] = [];

  for (const goal of goals) {
    const open = goal.milestones.filter((m) => !m.done);
    if (open.length === 0) continue;
    const next = [...open].sort((a, b) => byDate(a.dueDate, b.dueDate))[0];
    focus.push({ goal, next, remaining: open.length });
  }

  return focus
    .sort(
      (a, b) =>
        byDate(a.next.dueDate, b.next.dueDate) ||
        byDate(a.goal.targetDate, b.goal.targetDate) ||
        a.goal.createdAt.localeCompare(b.goal.createdAt)
    )
    .slice(0, limit);
}

// --- Bedtime -------------------------------------------------------------------

export interface BedtimeInfo {
  /** Inside the person's own sleep hours. */
  pastBedtime: boolean;
  /** Minutes until they said they sleep; null once it has passed. */
  minutesUntil: number | null;
  /** "23:00". */
  sleepLabel: string;
}

const DEFAULT_SLEEP = "23:00";
const DEFAULT_WAKE = "07:00";

/**
 * How long until bed, from the sleep and wake times the person gave (falling
 * back to the same defaults the energy model uses, so the two never disagree
 * about when the day ends). Sleep may wrap past midnight either way.
 */
export function bedtimeInfo(now: Date, sleepTime?: string, wakeTime?: string): BedtimeInfo {
  const sleepHour = parseHour(sleepTime ?? DEFAULT_SLEEP, parseHour(DEFAULT_SLEEP, 23));
  const wakeHour = parseHour(wakeTime ?? DEFAULT_WAKE, parseHour(DEFAULT_WAKE, 7));
  const sleep = Math.round(sleepHour * 60);
  const wake = Math.round(wakeHour * 60);
  const m = now.getHours() * 60 + now.getMinutes();

  const asleepWindow = sleep > wake ? m >= sleep || m < wake : m >= sleep && m < wake;
  const label = `${String(Math.floor(sleep / 60)).padStart(2, "0")}:${String(sleep % 60).padStart(2, "0")}`;

  if (asleepWindow) return { pastBedtime: true, minutesUntil: null, sleepLabel: label };
  return { pastBedtime: false, minutesUntil: (sleep - m + 1440) % 1440, sleepLabel: label };
}

/** "45 דקות", "שעה", "שעה ו-20 דקות", "3 שעות". */
export function durationLabel(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} דקות`;
  const hours = h === 1 ? "שעה" : `${h} שעות`;
  return rest === 0 ? hours : `${hours} ו-${rest} דקות`;
}

// --- Tomorrow ------------------------------------------------------------------

export interface TomorrowOutlook {
  dateKey: string;
  /** Everything scheduled for tomorrow. */
  count: number;
  /** The first few, timed items ahead of untimed. */
  items: { time: string | null; title: string }[];
  /** Open tasks due tomorrow (some are also among `items`). */
  tasksDue: number;
}

const MAX_TOMORROW_ITEMS = 3;

export function tomorrowOutlook(input: {
  now: Date;
  events: WeekCalendarEvent[];
  tasks: Task[];
  manualEvents: ManualEvent[];
  transactions: Transaction[];
  meals: Meal[];
  workouts: Workout[];
}): TomorrowOutlook {
  const next = new Date(input.now);
  next.setDate(next.getDate() + 1);
  const dateKey = localDateKey(next);

  const rows = buildDailyTimelineRows(
    dateKey,
    input.events,
    input.tasks,
    input.manualEvents,
    input.transactions,
    input.meals,
    input.workouts,
    false
  );

  // Timed items first, in time order (the builder already sorts them); the
  // untimed ones after, so "first thing tomorrow" is a real time when there is one.
  const timed = rows.filter((r) => r.time);
  const untimed = rows.filter((r) => !r.time);

  return {
    dateKey,
    count: rows.length,
    items: [...timed, ...untimed]
      .slice(0, MAX_TOMORROW_ITEMS)
      .map((row) => ({ time: row.time, title: timelineRowTitle(row) })),
    tasksDue: input.tasks.filter((t) => t.status !== "done" && t.dueDate?.slice(0, 10) === dateKey).length,
  };
}
