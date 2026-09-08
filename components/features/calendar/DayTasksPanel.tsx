"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, ListTodo, Plus } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { useApiCall } from "@/hooks/useApiCall";
import { HabitsSection } from "@/components/features/time/HabitsSection";
import { TaskSuggestions } from "@/components/features/time/TaskSuggestions";
import { NewTaskModal } from "@/components/features/time/NewTaskModal";
import { toDateKey } from "@/components/features/time/DayCarousel";
import { selectShiftsForDate, type WeekCalendarEvent } from "@/lib/time/buildDailyTimeline";
import { cn } from "@/lib/utils";
import type { Task } from "@/types";

interface DayTasksPanelProps {
  /** The day the calendar grid is showing. */
  anchor: Date;
  /** Google Calendar events for the week, for the AI suggester's context. */
  weekEvents: WeekCalendarEvent[];
}

// The "& Tasks" half of the unified Calendar & Tasks hub: the day's tasks,
// habits and AI task-suggestions right under the timeline, so one screen
// answers "what's my day" completely. The full backlog and the weekly
// skeleton editor stay at /areas/time — this is the daily working view.
export function DayTasksPanel({ anchor, weekEvents }: DayTasksPanelProps) {
  const tasks = useAtlasStore((s) => s.tasks);
  const addTask = useAtlasStore((s) => s.addTask);
  const updateTask = useAtlasStore((s) => s.updateTask);
  const habits = useAtlasStore((s) => s.habits);
  const habitLogs = useAtlasStore((s) => s.habitLogs);
  const transactions = useAtlasStore((s) => s.transactions);

  const [modalOpen, setModalOpen] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const { run: toggleTask } = useApiCall(updateTask);

  const dateKey = useMemo(() => toDateKey(anchor), [anchor]);
  const isToday = dateKey === toDateKey(new Date());

  const { dayTasks, doneToday } = useMemo(() => {
    const onDay = tasks.filter((t) => {
      if (t.dueDate) return t.dueDate.slice(0, 10) === dateKey;
      // Undated open tasks belong to "today" only.
      return isToday && t.status !== "done";
    });
    return {
      dayTasks: onDay
        .filter((t) => t.status !== "done")
        .sort((a, b) => (a.isHighPriority === b.isHighPriority ? 0 : a.isHighPriority ? -1 : 1)),
      doneToday: onDay.filter((t) => t.status === "done"),
    };
  }, [tasks, dateKey, isToday]);

  const shifts = useMemo(() => selectShiftsForDate(dateKey, transactions), [dateKey, transactions]);

  function toggle(task: Task) {
    toggleTask(task.id, { status: task.status === "done" ? "todo" : "done" }).catch(() => {});
  }

  return (
    <div className="mt-6 flex flex-col gap-5 border-t border-hairline-card pt-6">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-medium text-muted">
            <ListTodo size={16} className="text-accent-time" aria-hidden />
            משימות היום
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="focus-ring flex items-center gap-1 rounded-lg bg-accent-time/15 px-2.5 py-1.5 text-xs font-medium text-accent-time transition-opacity hover:opacity-80"
          >
            <Plus size={12} aria-hidden />
            משימה
          </button>
        </div>

        {dayTasks.length === 0 ? (
          <p className="text-xs text-muted">אין משימות פתוחות ליום הזה.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-hairline-card">
            {dayTasks.map((task) => (
              <li key={task.id} className="flex items-center gap-2.5 py-2 first:pt-0">
                <button
                  onClick={() => toggle(task)}
                  aria-label={`סמן "${task.title}" כבוצע`}
                  className="focus-ring flex size-5 shrink-0 items-center justify-center rounded-md border border-glass-border text-transparent transition-colors hover:border-accent-time/60"
                >
                  <Check size={12} aria-hidden />
                </button>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground/90">{task.title}</span>
                {task.isHighPriority && (
                  <span className="shrink-0 rounded-full bg-accent-time/15 px-1.5 text-[0.65rem] text-accent-time">
                    חשוב
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {doneToday.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setShowDone((v) => !v)}
              className="focus-ring flex items-center gap-1.5 rounded-lg text-xs text-muted transition-colors hover:text-foreground"
            >
              <ChevronDown size={13} className={cn("transition-transform", showDone && "rotate-180")} aria-hidden />
              בוצעו ({doneToday.length})
            </button>
            {showDone && (
              <ul className="mt-2 flex flex-col gap-1">
                {doneToday.map((task) => (
                  <li key={task.id} className="flex items-center gap-2 text-xs text-muted">
                    <Check size={11} className="text-accent-health" aria-hidden />
                    <span className="truncate line-through">{task.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <HabitsSection selectedDate={dateKey} />

      <TaskSuggestions
        events={weekEvents}
        shifts={shifts}
        habits={habits}
        habitLogs={habitLogs}
        selectedDate={dateKey}
        existingTasks={tasks.filter((t) => t.status !== "done")}
      />

      <NewTaskModal open={modalOpen} onClose={() => setModalOpen(false)} onCreate={addTask} />
    </div>
  );
}
