import type { Meal, ManualEvent, Task, Transaction, Workout } from "@/types";

// Shared with app/api/calendar/week/route.ts, which is this shape's
// source of truth — defined here (not there) so client components can
// import the type without importing anything from inside app/api/**.
export interface WeekCalendarEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  is_all_day: boolean;
}

export type TimelineRowData =
  | { kind: "event"; id: string; time: string | null; event: WeekCalendarEvent }
  | { kind: "task"; id: string; time: string | null; task: Task }
  | { kind: "manual-event"; id: string; time: string | null; manualEvent: ManualEvent }
  | { kind: "shift"; id: string; time: string | null; transaction: Transaction }
  | { kind: "meal"; id: string; time: string | null; meal: Meal }
  | { kind: "workout"; id: string; time: string | null; workout: Workout };

function dateKey(iso: string): string {
  return iso.slice(0, 10);
}

function minutesSinceMidnight(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

// Merges Google Calendar events, store tasks, manual (user-created)
// events, work-shift transactions, and Health & Fitness Space (Phase 8)
// meals/workouts into one ordered timeline for a single date: all-day
// events and (only on today, so they don't duplicate across all 7
// carousel days) undated open tasks float to the top as "Anytime" rows,
// everything else sorts chronologically by time. Manual events, shifts,
// meals, and workouts always carry a real timestamp, so they only ever
// appear in the chronological section, never "Anytime". Habits and AI
// Recommendations are real features now (HabitsSection,
// DailyRecommendations) rendered directly by Timeline after this list,
// not emitted as rows here — there's nothing left to placeholder.
export function buildDailyTimelineRows(
  selectedDate: string,
  events: WeekCalendarEvent[],
  tasks: Task[],
  manualEvents: ManualEvent[],
  transactions: Transaction[],
  meals: Meal[],
  workouts: Workout[],
  isToday: boolean
): TimelineRowData[] {
  const anytimeEvents: TimelineRowData[] = events
    .filter((e) => e.is_all_day && dateKey(e.start_time) === selectedDate)
    .map((e) => ({ kind: "event", id: `event-${e.id}`, time: null, event: e }));

  const anytimeTasks: TimelineRowData[] = (isToday ? tasks.filter((t) => !t.dueDate && t.status !== "done") : []).map(
    (t) => ({ kind: "task", id: `task-${t.id}`, time: null, task: t })
  );

  const timed = [
    ...events
      .filter((e) => !e.is_all_day && dateKey(e.start_time) === selectedDate)
      .map((e) => ({
        sortMinutes: minutesSinceMidnight(e.start_time),
        row: { kind: "event", id: `event-${e.id}`, time: formatTime(e.start_time), event: e } as TimelineRowData,
      })),
    ...tasks
      .filter((t): t is Task & { dueDate: string } => Boolean(t.dueDate) && dateKey(t.dueDate as string) === selectedDate)
      .map((t) => ({
        sortMinutes: minutesSinceMidnight(t.dueDate),
        row: { kind: "task", id: `task-${t.id}`, time: formatTime(t.dueDate), task: t } as TimelineRowData,
      })),
    ...manualEvents
      .filter((m) => dateKey(m.startTime) === selectedDate)
      .map((m) => ({
        sortMinutes: minutesSinceMidnight(m.startTime),
        row: {
          kind: "manual-event",
          id: `manual-${m.id}`,
          time: formatTime(m.startTime),
          manualEvent: m,
        } as TimelineRowData,
      })),
    ...transactions
      .filter((t): t is Transaction & { shiftStart: string } => Boolean(t.isShift && t.shiftStart) && dateKey(t.shiftStart as string) === selectedDate)
      .map((t) => ({
        sortMinutes: minutesSinceMidnight(t.shiftStart),
        row: { kind: "shift", id: `shift-${t.id}`, time: formatTime(t.shiftStart), transaction: t } as TimelineRowData,
      })),
    ...meals
      .filter((m) => dateKey(m.eatenAt) === selectedDate)
      .map((m) => ({
        sortMinutes: minutesSinceMidnight(m.eatenAt),
        row: { kind: "meal", id: `meal-${m.id}`, time: formatTime(m.eatenAt), meal: m } as TimelineRowData,
      })),
    ...workouts
      .filter((w) => dateKey(w.startTime) === selectedDate)
      .map((w) => ({
        sortMinutes: minutesSinceMidnight(w.startTime),
        row: { kind: "workout", id: `workout-${w.id}`, time: formatTime(w.startTime), workout: w } as TimelineRowData,
      })),
  ]
    .sort((a, b) => a.sortMinutes - b.sortMinutes)
    .map((entry) => entry.row);

  return [...anytimeEvents, ...anytimeTasks, ...timed];
}

// Work shifts for a single date — fed into the Daily AI Recommendations
// payload (see DailyRecommendations.tsx) so the AI can explicitly reason
// about a hard/long work day, distinct from selectOpenItemsForDate's
// events/tasks.
export function selectShiftsForDate(selectedDate: string, transactions: Transaction[]): Transaction[] {
  return transactions.filter((t) => t.isShift && t.shiftStart && dateKey(t.shiftStart) === selectedDate);
}

// Workouts for a single date — fed into the AI Nutrition Coach payload
// (Health & Fitness Space, Phase 8) so it can reason about today's actual
// physical load, same reasoning selectShiftsForDate already established
// for a hard/long work day.
export function selectWorkoutsForDate(selectedDate: string, workouts: Workout[]): Workout[] {
  return workouts.filter((w) => dateKey(w.startTime) === selectedDate);
}

// Meals already logged for a single date — the AI Nutrition Coach's other
// input, so it recommends what to eat *next*, not a menu that ignores
// what's already been eaten today.
export function selectMealsForDate(selectedDate: string, meals: Meal[]): Meal[] {
  return meals.filter((m) => dateKey(m.eatenAt) === selectedDate);
}

// The AI Recommendations payload: only the day's OPEN load (done tasks
// aren't part of "how busy is today"), distinct from buildDailyTimelineRows'
// own filters above, which intentionally include done tasks too since
// those still need to render (crossed-out) on the visual timeline.
export function selectOpenItemsForDate(
  selectedDate: string,
  events: WeekCalendarEvent[],
  tasks: Task[],
  isToday: boolean
): { events: WeekCalendarEvent[]; tasks: Task[] } {
  const dayEvents = events.filter((e) => dateKey(e.start_time) === selectedDate);

  const datedOpenTasks = tasks.filter(
    (t) => t.status !== "done" && t.dueDate && dateKey(t.dueDate) === selectedDate
  );
  const undatedOpenTasks = isToday ? tasks.filter((t) => t.status !== "done" && !t.dueDate) : [];

  return { events: dayEvents, tasks: [...datedOpenTasks, ...undatedOpenTasks] };
}
