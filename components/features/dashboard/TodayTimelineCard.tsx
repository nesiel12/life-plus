"use client";

import Link from "next/link";
import { AlarmClock, Apple, Briefcase, CalendarClock, Check, Dumbbell, ListTodo } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { useInsights } from "@/hooks/useInsights";
import { buildDailyTimelineRows, type TimelineRowData, type WeekCalendarEvent } from "@/lib/time/buildDailyTimeline";
import { toDateKey } from "@/components/features/time/DayCarousel";

const MAX_ROWS = 5;

interface WeekResponse {
  connected: boolean;
  events: WeekCalendarEvent[];
}

const FALLBACK: WeekResponse = { connected: false, events: [] };

function rowIcon(row: TimelineRowData) {
  switch (row.kind) {
    case "event":
      return CalendarClock;
    case "task":
      return ListTodo;
    case "manual-event":
      return AlarmClock;
    case "shift":
      return Briefcase;
    case "meal":
      return Apple;
    case "workout":
      return Dumbbell;
  }
}

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

// "Today's Timeline" (Sprint 6, the Unified Dashboard): a compact read of
// exactly what app/areas/time's own Timeline shows for today, reusing its
// real merge logic (lib/time/buildDailyTimeline.ts) rather than a second,
// simplified notion of "what's on today" that could quietly disagree with
// it. Deliberately not that component's own row renderer, though — this
// card's job is a glance, not the full editable Time Space (toggle-done,
// delete, per-kind chrome), so it's a plain icon+title+time list capped at
// MAX_ROWS with a link to the real page for everything else.
export function TodayTimelineCard() {
  const tasks = useAtlasStore((s) => s.tasks);
  const manualEvents = useAtlasStore((s) => s.manualEvents);
  const transactions = useAtlasStore((s) => s.transactions);
  const meals = useAtlasStore((s) => s.meals);
  const workouts = useAtlasStore((s) => s.workouts);

  const { data } = useInsights<WeekResponse>("/api/calendar/week", FALLBACK);
  const todayKey = toDateKey(new Date());

  const rows = buildDailyTimelineRows(
    todayKey,
    data?.events ?? [],
    tasks,
    manualEvents,
    transactions,
    meals,
    workouts,
    true
  );

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-muted">
          <CalendarClock size={16} className="text-accent-time" aria-hidden />
          היום שלך
        </p>
        <Link href="/areas/time" className="focus-ring rounded text-xs text-gold-ink transition-colors hover:opacity-80">
          לציר הזמן המלא
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted">אין כרגע כלום מתוזמן להיום.</p>
      ) : (
        <ul className="flex flex-1 flex-col gap-2.5">
          {rows.slice(0, MAX_ROWS).map((row) => {
            const Icon = rowIcon(row);
            const done = row.kind === "task" && row.task.status === "done";
            return (
              <li
                key={row.id}
                className="flex min-w-0 items-center gap-2.5 rounded-xl border border-hairline-card bg-surface-sunken/60 px-3 py-2 text-sm"
              >
                {done ? (
                  <Check size={14} className="shrink-0 text-accent-health" aria-hidden />
                ) : (
                  <Icon size={14} className="shrink-0 text-accent-time" aria-hidden />
                )}
                <span className={done ? "min-w-0 flex-1 truncate text-muted line-through" : "min-w-0 flex-1 truncate text-foreground/90"}>
                  {rowTitle(row)}
                </span>
                <span className="ltr shrink-0 whitespace-nowrap text-xs text-muted">{row.time ?? "היום"}</span>
              </li>
            );
          })}
          {rows.length > MAX_ROWS && (
            <li className="text-xs text-muted">ועוד {rows.length - MAX_ROWS} דברים היום.</li>
          )}
        </ul>
      )}
    </div>
  );
}
