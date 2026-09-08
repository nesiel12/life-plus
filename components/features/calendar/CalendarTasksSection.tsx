"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarPlus, ChevronDown, Loader2, Plus, Wand2 } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { useApiCall } from "@/hooks/useApiCall";
import { GlassCard } from "@/components/ui/GlassCard";
import { PinnedList } from "@/components/ui/PinnedList";
import { TaskCard } from "@/components/features/time/TaskCard";
import { HabitsSection } from "@/components/features/time/HabitsSection";
import { TaskSuggestions } from "@/components/features/time/TaskSuggestions";
import { DailyRecommendations } from "@/components/features/time/DailyRecommendations";
import { NewTaskModal } from "@/components/features/time/NewTaskModal";
import { NewManualEventModal } from "@/components/features/time/NewManualEventModal";
import { FocusModeHost } from "@/components/features/focus/FocusMode";
import { toDateKey } from "@/components/features/time/DayCarousel";
import {
  selectOpenItemsForDate,
  selectShiftsForDate,
  type WeekCalendarEvent,
} from "@/lib/time/buildDailyTimeline";
import { cn } from "@/lib/utils";
import type { Task } from "@/types";

type Tab = "tasks" | "habits" | "suggestions";

interface CalendarTasksSectionProps {
  anchor: Date;
  weekEvents: WeekCalendarEvent[];
  calendarConnected: boolean;
  onEventCreated: () => void;
}

// The whole of the former /areas/time page, folded under the calendar day
// view: full task list, habits, AI suggestions and load analysis — tabbed so
// the day view stays short on a phone. This is the "& Tasks" of the unified
// Calendar & Tasks screen.
export function CalendarTasksSection({
  anchor,
  weekEvents,
  calendarConnected,
  onEventCreated,
}: CalendarTasksSectionProps) {
  const tasks = useAtlasStore((s) => s.tasks);
  const addTask = useAtlasStore((s) => s.addTask);
  const updateTask = useAtlasStore((s) => s.updateTask);
  const deleteTask = useAtlasStore((s) => s.deleteTask);
  const addManualEvent = useAtlasStore((s) => s.addManualEvent);
  const personalDNA = useAtlasStore((s) => s.personalDNA);
  const upcomingEvents = useAtlasStore((s) => s.upcomingEvents);
  const transactions = useAtlasStore((s) => s.transactions);
  const habits = useAtlasStore((s) => s.habits);
  const habitLogs = useAtlasStore((s) => s.habitLogs);
  const people = useAtlasStore((s) => s.people);

  const [tab, setTab] = useState<Tab>("tasks");
  const [taskModal, setTaskModal] = useState(false);
  const [eventModal, setEventModal] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);

  const { error: toggleError, run: toggleTask } = useApiCall(updateTask);
  const { error: deleteErr, run: removeTask } = useApiCall(deleteTask);

  const dateKey = useMemo(() => toDateKey(anchor), [anchor]);
  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const isToday = dateKey === todayKey;

  const dayShifts = useMemo(() => selectShiftsForDate(dateKey, transactions), [dateKey, transactions]);
  const { events: openEvents, tasks: openTasks } = useMemo(
    () => selectOpenItemsForDate(dateKey, weekEvents, tasks, isToday),
    [dateKey, weekEvents, tasks, isToday]
  );

  const { todoTasks, doneTasks } = useMemo(() => {
    const todo = tasks
      .filter((t) => t.status !== "done")
      .sort((a, b) => {
        if (a.isHighPriority !== b.isHighPriority) return a.isHighPriority ? -1 : 1;
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      });
    return { todoTasks: todo, doneTasks: tasks.filter((t) => t.status === "done") };
  }, [tasks]);

  const taskSchedule = useMemo(() => {
    if (!calendarConnected) return undefined;
    return {
      busy: weekEvents.map((e) => ({ start: e.start_time, end: e.end_time, title: e.title })),
      chronotype: personalDNA.chronotype,
      onScheduled: onEventCreated,
    };
  }, [calendarConnected, weekEvents, personalDNA.chronotype, onEventCreated]);

  const {
    loading: prioritizing,
    error: prioritizeError,
    run: runPrioritize,
  } = useApiCall(async () => {
    const open = tasks.filter((t) => t.status === "todo" || t.status === "in-progress");
    if (open.length === 0) return;
    const res = await fetch("/api/ai/prioritize-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tasks: open.map((t) => ({ id: t.id, title: t.title, description: t.description, dueDate: t.dueDate, status: t.status })),
        context: {
          peakFocusHours: personalDNA.peakFocusHours,
          upcomingEvents: upcomingEvents.filter((e) => e.date >= todayKey).slice(0, 5).map((e) => ({ title: e.title, date: e.date })),
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "התעדוף נכשל. נסה שוב.");
    for (const id of (data.prioritized_task_ids ?? []) as string[]) {
      await updateTask(id, { isHighPriority: true });
    }
  });

  function handleToggleDone(task: Task) {
    toggleTask(task.id, { status: task.status === "done" ? "todo" : "done" }).catch(() => {});
  }
  function handleTogglePin(task: Task) {
    toggleTask(task.id, { isHighPriority: !task.isHighPriority }).catch(() => {});
  }
  function handleDelete(id: string) {
    removeTask(id).catch(() => {});
  }

  const anyError = toggleError ?? deleteErr ?? prioritizeError;

  const TABS: { id: Tab; label: string }[] = [
    { id: "tasks", label: `משימות${todoTasks.length ? ` (${todoTasks.length})` : ""}` },
    { id: "habits", label: "הרגלים" },
    { id: "suggestions", label: "הצעות וניתוח" },
  ];

  return (
    <div className="mt-6 border-t border-hairline-card pt-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg bg-fill-subtle p-0.5" role="tablist">
          {TABS.map((tItem) => (
            <button
              key={tItem.id}
              role="tab"
              aria-selected={tab === tItem.id}
              onClick={() => setTab(tItem.id)}
              className={cn(
                "focus-ring rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                tab === tItem.id ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
              )}
            >
              {tItem.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setEventModal(true)}
            className="focus-ring flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
          >
            <CalendarPlus size={13} aria-hidden />
            אירוע
          </button>
          <button
            onClick={() => setTaskModal(true)}
            className="focus-ring flex items-center gap-1 rounded-lg bg-accent-time/20 px-2.5 py-1.5 text-xs font-medium text-accent-time transition-opacity hover:opacity-80"
          >
            <Plus size={13} aria-hidden />
            משימה
          </button>
        </div>
      </div>

      {anyError && <p className="mb-3 text-xs text-accent-family">{anyError}</p>}

      {tab === "tasks" && (
        <div>
          {todoTasks.length > 1 && (
            <button
              onClick={() => !prioritizing && runPrioritize().catch(() => {})}
              disabled={prioritizing}
              className="focus-ring mb-3 flex items-center gap-1.5 rounded-lg text-xs text-muted transition-colors hover:text-foreground disabled:opacity-40"
            >
              {prioritizing ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Wand2 size={13} aria-hidden />}
              {prioritizing ? "מתעדף…" : "תעדף עם AI"}
            </button>
          )}

          <PinnedList
            items={todoTasks}
            getKey={(t) => t.id}
            isPinned={(t) => t.isHighPriority}
            onTogglePin={handleTogglePin}
            empty={<p className="text-sm text-muted">אין משימות פתוחות. הוסף אחת כדי להתחיל.</p>}
          >
            {(task, { pinned, togglePin }) => (
              <TaskCard
                task={task}
                delay={0}
                onToggleDone={handleToggleDone}
                onDelete={handleDelete}
                pinned={pinned}
                onTogglePin={togglePin}
                schedule={taskSchedule}
                onFocus={() => setFocusTaskId(task.id)}
              />
            )}
          </PinnedList>

          {doneTasks.length > 0 && (
            <div className="mt-3">
              <button
                onClick={() => setShowDone((v) => !v)}
                className="focus-ring flex items-center gap-1.5 rounded-lg text-xs text-muted transition-colors hover:text-foreground"
              >
                <ChevronDown size={13} className={cn("transition-transform", showDone && "rotate-180")} aria-hidden />
                בוצעו ({doneTasks.length})
              </button>
              {showDone && (
                <div className="mt-3 flex flex-col gap-3">
                  {doneTasks.map((task) => (
                    <TaskCard key={task.id} task={task} delay={0} onToggleDone={handleToggleDone} onDelete={handleDelete} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "habits" && (
        <GlassCard>
          <HabitsSection selectedDate={dateKey} />
        </GlassCard>
      )}

      {tab === "suggestions" && (
        <div className="flex flex-col gap-5">
          <DailyRecommendations dateKey={dateKey} events={openEvents} tasks={openTasks} shifts={dayShifts} />
          <TaskSuggestions
            events={openEvents}
            shifts={dayShifts}
            habits={habits}
            habitLogs={habitLogs}
            selectedDate={dateKey}
            existingTasks={tasks.filter((t) => t.status !== "done")}
          />
        </div>
      )}

      {prioritizing && (
        <GlassCard delay={0} className="mt-4 flex items-center justify-center gap-3 py-5">
          <motion.div
            animate={{
              boxShadow: [
                "0 0 20px -6px color-mix(in srgb, var(--accent-time) 45%, transparent)",
                "0 0 40px -6px color-mix(in srgb, var(--accent-time) 70%, transparent)",
                "0 0 20px -6px color-mix(in srgb, var(--accent-time) 45%, transparent)",
              ],
            }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="flex size-9 items-center justify-center rounded-full bg-accent-time/10"
          >
            <Wand2 size={16} className="text-accent-time" aria-hidden />
          </motion.div>
          <p className="text-sm text-muted">מתעדף משימות בעזרת AI…</p>
        </GlassCard>
      )}

      <FocusModeHost
        open={focusTaskId !== null}
        task={tasks.find((t) => t.id === focusTaskId) ?? null}
        onClose={() => setFocusTaskId(null)}
      />
      <NewTaskModal open={taskModal} onClose={() => setTaskModal(false)} onCreate={addTask} />
      <NewManualEventModal
        open={eventModal}
        onClose={() => setEventModal(false)}
        onCreate={addManualEvent}
        people={people}
      />
    </div>
  );
}
