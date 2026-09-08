"use client";

import { useMemo } from "react";
import {
  Apple,
  Briefcase,
  CalendarClock,
  CalendarPlus,
  Check,
  Dumbbell,
  ListTodo,
  Sun,
  Sunrise,
  Sunset,
  Moon,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";
import type { TimelineRowData } from "@/lib/time/buildDailyTimeline";
import type { Task, Transaction } from "@/types";

interface DailyDigestProps {
  rows: TimelineRowData[];
  shifts: Transaction[];
  selectedDate: string;
  isToday: boolean;
  onToggleTaskDone: (task: Task) => void;
  onDeleteManualEvent: (eventId: string) => void;
}

function greetingByHour(hour: number): { label: string; Icon: LucideIcon } {
  if (hour >= 5 && hour < 12) return { label: "בוקר טוב", Icon: Sunrise };
  if (hour >= 12 && hour < 17) return { label: "צהריים טובים", Icon: Sun };
  if (hour >= 17 && hour < 21) return { label: "ערב טוב", Icon: Sunset };
  return { label: "לילה טוב", Icon: Moon };
}

const ROW_ICON: Record<TimelineRowData["kind"], LucideIcon> = {
  event: CalendarClock,
  task: ListTodo,
  "manual-event": CalendarPlus,
  shift: Briefcase,
  meal: Apple,
  workout: Dumbbell,
};

function rowTitle(row: TimelineRowData): string {
  switch (row.kind) {
    case "event":
      return row.event.title;
    case "task":
      return row.task.title;
    case "manual-event":
      return row.manualEvent.title;
    case "shift":
      return row.transaction.employer ? `משמרת · ${row.transaction.employer}` : row.transaction.title;
    case "meal":
      return row.meal.description;
    case "workout":
      return row.workout.title;
  }
}

function buildSummary(rows: TimelineRowData[], shifts: Transaction[]): string {
  const events = rows.filter((r) => r.kind === "event" || r.kind === "manual-event").length;
  const openTasks = rows.filter((r) => r.kind === "task" && r.task.status !== "done").length;
  const workouts = rows.filter((r) => r.kind === "workout").length;
  const shiftHours = shifts.reduce((sum, t) => {
    if (!t.shiftStart || !t.shiftEnd) return sum;
    return sum + (new Date(t.shiftEnd).getTime() - new Date(t.shiftStart).getTime()) / 3_600_000;
  }, 0);

  const parts: string[] = [];
  if (events > 0) parts.push(`${events} ${events === 1 ? "אירוע" : "אירועים"}`);
  if (openTasks > 0) parts.push(`${openTasks} ${openTasks === 1 ? "משימה" : "משימות"}`);
  if (shiftHours > 0) parts.push(`משמרת ${Math.round(shiftHours * 10) / 10} שע׳`);
  if (workouts > 0) parts.push(`${workouts} ${workouts === 1 ? "אימון" : "אימונים"}`);

  return parts.length > 0 ? parts.join(" · ") : "היום פנוי לגמרי.";
}

// The day at a glance — one line of what's on, then a flat chronological
// list. Replaces the old vertical-spine Timeline, which stacked a glass
// card per row plus a nested habits panel and AI panel inside one giant
// component: a lot of chrome for "what's happening today". Habits and the
// AI daily nudges are their own cards on the page now, not folded in here.
export function DailyDigest({
  rows,
  shifts,
  selectedDate,
  isToday,
  onToggleTaskDone,
  onDeleteManualEvent,
}: DailyDigestProps) {
  const { label, Icon } = useMemo(() => {
    if (isToday) return greetingByHour(new Date().getHours());
    return {
      label: new Date(selectedDate).toLocaleDateString("he-IL", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
      }),
      Icon: CalendarClock,
    };
  }, [isToday, selectedDate]);

  const summary = useMemo(() => buildSummary(rows, shifts), [rows, shifts]);

  return (
    <GlassCard>
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-time/10 text-accent-time">
          <Icon size={16} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold tracking-tight text-foreground">{label}</p>
          <p className="mt-0.5 truncate text-xs text-muted">{summary}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="py-3 text-sm text-muted">אין כלום מתוזמן ליום הזה עדיין.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline-card">
          {rows.map((row) => {
            const RowIcon = ROW_ICON[row.kind];
            const done = row.kind === "task" && row.task.status === "done";
            const isTask = row.kind === "task";
            const isManual = row.kind === "manual-event";

            return (
              <li key={row.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                {isTask ? (
                  <button
                    onClick={() => onToggleTaskDone(row.task)}
                    aria-label={done ? `בטל סימון "${row.task.title}"` : `סמן "${row.task.title}" כבוצע`}
                    className={cn(
                      "focus-ring flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                      done
                        ? "border-accent-time bg-accent-time/20 text-accent-time"
                        : "border-glass-border text-transparent hover:border-accent-time/60"
                    )}
                  >
                    <Check size={12} aria-hidden />
                  </button>
                ) : (
                  <span className="flex size-5 shrink-0 items-center justify-center text-accent-time">
                    <RowIcon size={15} aria-hidden />
                  </span>
                )}

                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm",
                    done ? "text-muted line-through" : "text-foreground/90"
                  )}
                >
                  {rowTitle(row)}
                </span>

                {row.time && (
                  <span className="ltr shrink-0 whitespace-nowrap text-xs tabular-nums text-muted">
                    {row.time}
                  </span>
                )}

                {isManual && (
                  <button
                    onClick={() => onDeleteManualEvent(row.manualEvent.id)}
                    aria-label={`מחק את ${row.manualEvent.title}`}
                    className="focus-ring shrink-0 rounded p-1 text-muted transition-colors hover:text-accent-family"
                  >
                    <Trash2 size={13} aria-hidden />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </GlassCard>
  );
}
