"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarPlus, CalendarRange, ChevronDown, Loader2, Plus, Wand2 } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { useApiCall } from "@/hooks/useApiCall";
import { useInsights } from "@/hooks/useInsights";
import { GlassCard } from "@/components/ui/GlassCard";
import { TaskCard } from "@/components/features/time/TaskCard";
import { PinnedList } from "@/components/ui/PinnedList";
import { FocusModeHost } from "@/components/features/focus/FocusMode";
import { NewTaskModal } from "@/components/features/time/NewTaskModal";
import { NewManualEventModal } from "@/components/features/time/NewManualEventModal";
import { TaskSuggestions } from "@/components/features/time/TaskSuggestions";
import { DayCarousel, toDateKey } from "@/components/features/time/DayCarousel";
import { WeeklySchedule } from "@/components/features/schedule/WeeklySchedule";
import { DailyDigest } from "@/components/features/time/DailyDigest";
import { HabitsSection } from "@/components/features/time/HabitsSection";
import { DailyRecommendations } from "@/components/features/time/DailyRecommendations";
import {
  buildDailyTimelineRows,
  selectOpenItemsForDate,
  selectShiftsForDate,
  type WeekCalendarEvent,
} from "@/lib/time/buildDailyTimeline";
import type { Task } from "@/types";
import { BackToHome } from "@/components/layout/BackToHome";

interface WeekCalendarResponse {
  connected: boolean;
  events: WeekCalendarEvent[];
}

// Time & Tasks Space. One clean stack: the day at a glance (DailyDigest),
// the day's habits and one or two AI nudges, then the task list. The weekly
// skeleton and the AI task-suggestions live in collapsible sections at the
// bottom — real features, but not what you came here to look at.
export default function TimeSpacePage() {
  const tasks = useAtlasStore((s) => s.tasks);
  const addTask = useAtlasStore((s) => s.addTask);
  const updateTask = useAtlasStore((s) => s.updateTask);
  const deleteTask = useAtlasStore((s) => s.deleteTask);
  const personalDNA = useAtlasStore((s) => s.personalDNA);
  const upcomingEvents = useAtlasStore((s) => s.upcomingEvents);
  const manualEvents = useAtlasStore((s) => s.manualEvents);
  const addManualEvent = useAtlasStore((s) => s.addManualEvent);
  const deleteManualEvent = useAtlasStore((s) => s.deleteManualEvent);
  const transactions = useAtlasStore((s) => s.transactions);
  const meals = useAtlasStore((s) => s.meals);
  const workouts = useAtlasStore((s) => s.workouts);
  const people = useAtlasStore((s) => s.people);
  const habits = useAtlasStore((s) => s.habits);
  const habitLogs = useAtlasStore((s) => s.habitLogs);

  const [modalOpen, setModalOpen] = useState(false);
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const { error: toggleError, run: toggleTask } = useApiCall(updateTask);
  const { error: deleteError, run: removeTask } = useApiCall(deleteTask);
  const { error: deleteEventError, run: removeManualEvent } = useApiCall(deleteManualEvent);

  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const isSelectedToday = selectedDate === todayKey;

  const { data: weekCalendar, refresh: refreshWeekCalendar } = useInsights<WeekCalendarResponse>(
    "/api/calendar/week",
    { connected: false, events: [] }
  );

  const timelineRows = useMemo(
    () =>
      buildDailyTimelineRows(
        selectedDate,
        weekCalendar?.events ?? [],
        tasks,
        manualEvents,
        transactions,
        meals,
        workouts,
        isSelectedToday
      ),
    [selectedDate, weekCalendar, tasks, manualEvents, transactions, meals, workouts, isSelectedToday]
  );

  const dayShifts = useMemo(
    () => selectShiftsForDate(selectedDate, transactions),
    [selectedDate, transactions]
  );

  const { events: openEvents, tasks: openTasks } = useMemo(
    () => selectOpenItemsForDate(selectedDate, weekCalendar?.events ?? [], tasks, isSelectedToday),
    [selectedDate, weekCalendar, tasks, isSelectedToday]
  );

  // AI Auto-Prioritization: sends every open task plus real context from the
  // store to /api/ai/prioritize-tasks, then flips is_high_priority on the IDs
  // that come back. Additive only — a task not returned keeps its state.
  const {
    loading: prioritizing,
    error: prioritizeError,
    run: runPrioritize,
  } = useApiCall(async () => {
    const allOpenTasks = tasks.filter((t) => t.status === "todo" || t.status === "in-progress");
    if (allOpenTasks.length === 0) return;

    const res = await fetch("/api/ai/prioritize-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tasks: allOpenTasks.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          dueDate: t.dueDate,
          status: t.status,
        })),
        context: {
          peakFocusHours: personalDNA.peakFocusHours,
          upcomingEvents: upcomingEvents
            .filter((e) => e.date >= todayKey)
            .slice(0, 5)
            .map((e) => ({ title: e.title, date: e.date })),
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "התעדוף נכשל. נסה שוב.");

    const prioritizedTaskIds: string[] = data.prioritized_task_ids ?? [];
    for (const id of prioritizedTaskIds) {
      await updateTask(id, { isHighPriority: true });
    }
  });

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
    const done = tasks.filter((t) => t.status === "done");
    return { todoTasks: todo, doneTasks: done };
  }, [tasks]);

  const taskSchedule = useMemo(() => {
    if (!weekCalendar?.connected) return undefined;
    return {
      busy: weekCalendar.events.map((e) => ({ start: e.start_time, end: e.end_time, title: e.title })),
      chronotype: personalDNA.chronotype,
      onScheduled: refreshWeekCalendar,
    };
  }, [weekCalendar, personalDNA.chronotype, refreshWeekCalendar]);

  function handleToggleDone(task: Task) {
    toggleTask(task.id, { status: task.status === "done" ? "todo" : "done" }).catch(() => {});
  }

  function handleTogglePin(task: Task) {
    toggleTask(task.id, { isHighPriority: !task.isHighPriority }).catch(() => {});
  }

  function handleDelete(taskId: string) {
    removeTask(taskId).catch(() => {});
  }

  function handleDeleteManualEvent(eventId: string) {
    removeManualEvent(eventId).catch(() => {});
  }

  function handlePrioritize() {
    if (prioritizing) return;
    runPrioritize().catch(() => {});
  }

  const anyError = toggleError ?? deleteError ?? prioritizeError ?? deleteEventError;

  return (
    <main className="min-h-screen px-6 py-16 sm:px-10 lg:px-16">
      <BackToHome className="mb-6 -ms-2.5" />

      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-1 text-2xl font-medium tracking-tight">זמן ומשימות</h1>
          <p className="text-sm text-muted">היום שלך, וכל מה שצריך להיעשות.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handlePrioritize}
            disabled={prioritizing || todoTasks.length === 0}
            className="focus-ring flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:text-foreground disabled:opacity-40"
          >
            {prioritizing ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Wand2 size={14} aria-hidden />}
            {prioritizing ? "מתעדף…" : "תעדף עם AI"}
          </button>
          <button
            onClick={() => setEventModalOpen(true)}
            className="focus-ring flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:text-foreground"
          >
            <CalendarPlus size={14} aria-hidden />
            אירוע
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="focus-ring flex items-center gap-1.5 rounded-lg bg-accent-time/20 px-4 py-2 text-sm font-medium text-accent-time transition-opacity hover:opacity-80"
          >
            <Plus size={14} aria-hidden />
            משימה חדשה
          </button>
        </div>
      </div>

      {anyError && <p className="mb-6 text-xs text-accent-family">{anyError}</p>}

      <div className="flex flex-col gap-6">
        <div>
          <DayCarousel selectedDate={selectedDate} onSelect={setSelectedDate} />
          <DailyDigest
            rows={timelineRows}
            shifts={dayShifts}
            selectedDate={selectedDate}
            isToday={isSelectedToday}
            onToggleTaskDone={handleToggleDone}
            onDeleteManualEvent={handleDeleteManualEvent}
          />
        </div>

        <GlassCard>
          <HabitsSection selectedDate={selectedDate} />
        </GlassCard>

        <DailyRecommendations
          dateKey={selectedDate}
          events={openEvents}
          tasks={openTasks}
          shifts={dayShifts}
        />

        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-lg font-medium tracking-tight text-foreground">המשימות שלי</h2>
            <span className="text-xs text-muted">{todoTasks.length} פתוחות</span>
          </div>

          <PinnedList
            items={todoTasks}
            getKey={(task) => task.id}
            isPinned={(task) => task.isHighPriority}
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
            <div className="mt-4">
              <button
                onClick={() => setShowDone((v) => !v)}
                className="focus-ring flex items-center gap-1.5 rounded-lg text-sm text-muted transition-colors hover:text-foreground"
              >
                <ChevronDown
                  size={14}
                  className={showDone ? "rotate-180 transition-transform" : "transition-transform"}
                  aria-hidden
                />
                בוצעו ({doneTasks.length})
              </button>
              {showDone && (
                <div className="mt-3 flex flex-col gap-3">
                  {doneTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      delay={0}
                      onToggleDone={handleToggleDone}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <details className="group rounded-2xl border border-hairline-card bg-surface-sunken/40 [&_summary]:list-none">
          <summary className="focus-ring flex cursor-pointer items-center justify-between gap-2 rounded-2xl px-4 py-3.5">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              <CalendarRange size={16} className="text-accent-time" aria-hidden />
              הצעות AI למשימות
            </span>
            <ChevronDown size={16} className="text-muted transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="px-4 pb-4">
            <TaskSuggestions
              events={openEvents}
              shifts={dayShifts}
              habits={habits}
              habitLogs={habitLogs}
              selectedDate={selectedDate}
              existingTasks={tasks.filter((t) => t.status !== "done")}
            />
          </div>
        </details>

        <details className="group rounded-2xl border border-hairline-card bg-surface-sunken/40 [&_summary]:list-none">
          <summary className="focus-ring flex cursor-pointer items-center justify-between gap-2 rounded-2xl px-4 py-3.5">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              <CalendarRange size={16} className="text-accent-time" aria-hidden />
              הלוז השבועי
            </span>
            <ChevronDown size={16} className="text-muted transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="px-4 pb-4">
            <p className="mb-4 text-xs text-muted">
              השלד הקבוע של השבוע שלך. על בסיסו האפליקציה יודעת מה עכשיו, מה הבא, ומתי אתה באמת פנוי.
            </p>
            <WeeklySchedule />
          </div>
        </details>
      </div>

      {prioritizing && (
        <GlassCard delay={0} className="mt-6 flex items-center justify-center gap-3 py-6">
          <motion.div
            animate={{
              boxShadow: [
                "0 0 20px -6px color-mix(in srgb, var(--accent-time) 45%, transparent)",
                "0 0 44px -6px color-mix(in srgb, var(--accent-time) 75%, transparent)",
                "0 0 20px -6px color-mix(in srgb, var(--accent-time) 45%, transparent)",
              ],
            }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="flex size-10 items-center justify-center rounded-full bg-accent-time/10"
          >
            <Wand2 size={18} className="text-accent-time" aria-hidden />
          </motion.div>
          <p className="text-sm text-muted">מתעדף משימות בעזרת AI…</p>
        </GlassCard>
      )}

      <FocusModeHost
        open={focusTaskId !== null}
        task={tasks.find((t) => t.id === focusTaskId) ?? null}
        onClose={() => setFocusTaskId(null)}
      />

      <NewTaskModal open={modalOpen} onClose={() => setModalOpen(false)} onCreate={addTask} />
      <NewManualEventModal
        open={eventModalOpen}
        onClose={() => setEventModalOpen(false)}
        onCreate={addManualEvent}
        people={people}
      />
    </main>
  );
}
