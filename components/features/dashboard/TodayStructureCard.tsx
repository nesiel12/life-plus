"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarClock, Check, ListTodo, Repeat } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { useInsights } from "@/hooks/useInsights";
import { buildDailyTimelineRows, type TimelineRowData, type WeekCalendarEvent } from "@/lib/time/buildDailyTimeline";
import { toDateKey } from "@/components/features/time/DayCarousel";

interface WeekResponse {
  connected: boolean;
  events: WeekCalendarEvent[];
}

const FALLBACK: WeekResponse = { connected: false, events: [] };
const MAX_ROWS = 4;

function rowTitle(row: TimelineRowData): string {
  switch (row.kind) {
    case "event":
      return row.event.title;
    case "task":
      return row.task.title;
    case "manual-event":
      return row.manualEvent.title;
    case "shift":
      return row.transaction.title;
    case "meal":
      return row.meal.description;
    case "workout":
      return row.workout.title;
  }
}

// "Today's Structure" — the dashboard's window into the unified Calendar &
// Tasks hub. The next few things on the day, plus open-task and habit counts,
// all linking through to /calendar where the full day lives.
export function TodayStructureCard() {
  const tasks = useAtlasStore((s) => s.tasks);
  const manualEvents = useAtlasStore((s) => s.manualEvents);
  const transactions = useAtlasStore((s) => s.transactions);
  const meals = useAtlasStore((s) => s.meals);
  const workouts = useAtlasStore((s) => s.workouts);
  const habits = useAtlasStore((s) => s.habits);
  const habitLogs = useAtlasStore((s) => s.habitLogs);

  const { data } = useInsights<WeekResponse>("/api/calendar/week", FALLBACK);
  const todayKey = toDateKey(new Date());

  const rows = useMemo(
    () =>
      buildDailyTimelineRows(
        todayKey,
        data?.events ?? [],
        tasks,
        manualEvents,
        transactions,
        meals,
        workouts,
        true
      ),
    [todayKey, data, tasks, manualEvents, transactions, meals, workouts]
  );

  const upcoming = useMemo(() => {
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    return rows
      .filter((r) => {
        if (!r.time) return true;
        const [h, m] = r.time.split(":").map(Number);
        return h * 60 + m >= nowMin - 30;
      })
      .slice(0, MAX_ROWS);
  }, [rows]);

  const openTasks = tasks.filter((t) => t.status !== "done").length;
  const habitsDone = habitLogs.filter((l) => l.completedDate === todayKey).length;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-muted">
          <CalendarClock size={16} className="text-accent-time" aria-hidden />
          מבנה היום
        </p>
        <Link href="/calendar" className="focus-ring flex items-center gap-1 rounded text-xs text-gold-ink hover:opacity-80">
          ליומן המלא
          <ArrowLeft size={12} aria-hidden />
        </Link>
      </div>

      {upcoming.length === 0 ? (
        <p className="text-xs text-muted">אין עוד דברים מתוזמנים להיום.</p>
      ) : (
        <ul className="flex flex-1 flex-col gap-2">
          {upcoming.map((row) => {
            const done = row.kind === "task" && row.task.status === "done";
            return (
              <li
                key={row.id}
                className="flex min-w-0 items-center gap-2.5 rounded-xl border border-hairline-card bg-surface-sunken/60 px-3 py-2 text-sm"
              >
                {done ? (
                  <Check size={14} className="shrink-0 text-accent-health" aria-hidden />
                ) : row.kind === "task" ? (
                  <ListTodo size={14} className="shrink-0 text-accent-time" aria-hidden />
                ) : (
                  <CalendarClock size={14} className="shrink-0 text-accent-time" aria-hidden />
                )}
                <span className={done ? "min-w-0 flex-1 truncate text-muted line-through" : "min-w-0 flex-1 truncate text-foreground/90"}>
                  {rowTitle(row)}
                </span>
                <span className="ltr shrink-0 whitespace-nowrap text-xs text-muted">{row.time ?? "היום"}</span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex items-center gap-4 border-t border-hairline-card pt-2.5 text-xs text-muted">
        <span className="flex items-center gap-1">
          <ListTodo size={12} aria-hidden />
          {openTasks} משימות פתוחות
        </span>
        {habits.length > 0 && (
          <span className="flex items-center gap-1">
            <Repeat size={12} aria-hidden />
            {habitsDone}/{habits.length} הרגלים
          </span>
        )}
      </div>
    </div>
  );
}
