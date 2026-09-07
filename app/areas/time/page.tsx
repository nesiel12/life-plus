"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarPlus, CalendarRange, Loader2, Plus, Wand2 } from "lucide-react";
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
import { Timeline } from "@/components/features/time/Timeline";
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

// Time & Tasks Space (Phase 5). Two layers on one page: a Day Carousel +
// Unified Vertical Timeline (real Google Calendar events merged with
// tasks for whichever date is selected — see lib/time/buildDailyTimeline)
// sits above "כל המשימות", the plain status-grouped "לביצוע"/"בוצע" list
// from the previous milestone (an 'in-progress' status exists in the
// schema, but the checkbox is deliberately just todo <-> done) plus AI
// Auto-Prioritization. Both views read from the same tasks slice in
// useAtlasStore, so toggling a task done in one place updates the other
// instantly.
export default function TimeSpacePage() {
  const tasks = useAtlasStore((s) => s.tasks);
  const addTask = useAtlasStore((s) => s.addTask);
  const updateTask = useAtlasStore((s) => s.updateTask);
  const deleteTask = useAtlasStore((s) => s.deleteTask);
  const personalDNA = useAtlasStore((s) => s.personalDNA);
  const upcomingEvents = useAtlasStore((s) => s.upcomingEvents);
  const people = useAtlasStore((s) => s.people);
  const manualEvents = useAtlasStore((s) => s.manualEvents);
  const addManualEvent = useAtlasStore((s) => s.addManualEvent);
  const deleteManualEvent = useAtlasStore((s) => s.deleteManualEvent);
  const transactions = useAtlasStore((s) => s.transactions);
  const meals = useAtlasStore((s) => s.meals);
  const workouts = useAtlasStore((s) => s.workouts);
  const habits = useAtlasStore((s) => s.habits);
  const habitLogs = useAtlasStore((s) => s.habitLogs);

  const [modalOpen, setModalOpen] = useState(false);
  // Focus Mode is tethered to a specific task, so the overlay can show what
  // is being worked on and offer to complete it on the way out.
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const { error: toggleError, run: toggleTask } = useApiCall(updateTask);
  const { error: deleteError, run: removeTask } = useApiCall(deleteTask);
  const { error: deleteEventError, run: removeManualEvent } = useApiCall(deleteManualEvent);

  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const [selectedDate, setSelectedDate] = useState(todayKey);

  // Real Google Calendar events for the carousel's 7-day window — the
  // same progressive-enhancement pattern (useInsights) every other
  // AI/insights-layered screen uses: renders instantly with an empty
  // timeline, layers in real events once the fetch resolves.
  const { data: weekCalendar, refresh: refreshWeekCalendar } = useInsights<WeekCalendarResponse>(
    "/api/calendar/week",
    { connected: false, events: [] }
  );

  const isSelectedToday = selectedDate === todayKey;

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

  // The day's open load only (done tasks excluded) — what
  // DailyRecommendations actually sends to the AI, distinct from
  // timelineRows above which still needs done tasks for display.
  const { events: openEvents, tasks: openTasks } = useMemo(
    () => selectOpenItemsForDate(selectedDate, weekCalendar?.events ?? [], tasks, isSelectedToday),
    [selectedDate, weekCalendar, tasks, isSelectedToday]
  );

  // AI Auto-Prioritization: sends every currently-open task (across all
  // dates, not just the selected day — deliberately the full open list,
  // unlike openTasks above which is scoped to selectedDate) plus real
  // context from the store (the user's own personalDNA and their own real
  // upcoming events, never a fixed or invented personal fact) to
  // /api/ai/prioritize-tasks, then flips is_high_priority on whichever IDs
  // come back via the exact same updateTask action the done-checkbox uses.
  // Deliberately additive only, per spec — a task not returned this run
  // keeps whatever is_high_priority it already had, it isn't cleared.
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
        // High priority always bubbles to the top, overriding due-date
        // order — due date is only the tiebreaker within each tier.
        if (a.isHighPriority !== b.isHighPriority) return a.isHighPriority ? -1 : 1;
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      });
    const done = tasks.filter((t) => t.status === "done");
    return { todoTasks: todo, doneTasks: done };
  }, [tasks]);

  // TaskCard's "הצע זמן ביומן" (Sprint 5): reuses the week's already-fetched
  // Google Calendar events as the busy set, same source the Vertical
  // Timeline above already renders from — no second calendar fetch. Only
  // offered when Google Calendar is actually connected; otherwise there is
  // no real busy set to check against, and the create-event call would just
  // fail with "not connected" after the user already picked a slot.
  const taskSchedule = useMemo(() => {
    if (!weekCalendar?.connected) return undefined;
    return {
      busy: weekCalendar.events.map((e) => ({ start: e.start_time, end: e.end_time, title: e.title })),
      chronotype: personalDNA.chronotype,
      onScheduled: refreshWeekCalendar,
    };
  }, [weekCalendar, personalDNA.chronotype, refreshWeekCalendar]);

  function handleToggleDone(task: Task) {
    toggleTask(task.id, { status: task.status === "done" ? "todo" : "done" }).catch(() => {
      // error is already captured in toggleError for display below
    });
  }

  // Pinning *is* high priority — the same field the AI prioritizer writes
  // (handlePrioritize below) and the same updateTask action the done-toggle
  // uses, so a pin survives a reload instead of being a view-only flourish.
  function handleTogglePin(task: Task) {
    toggleTask(task.id, { isHighPriority: !task.isHighPriority }).catch(() => {
      // error is already captured in toggleError for display below
    });
  }

  function handleDelete(taskId: string) {
    removeTask(taskId).catch(() => {
      // error is already captured in deleteError for display below
    });
  }

  function handleDeleteManualEvent(eventId: string) {
    removeManualEvent(eventId).catch(() => {
      // error is already captured in deleteEventError for display below
    });
  }

  function handlePrioritize() {
    if (prioritizing) return;
    runPrioritize().catch(() => {
      // error is already captured in prioritizeError for display below
    });
  }

  return (
    <main className="min-h-screen px-6 py-16 sm:px-10 lg:px-16">
      <BackToHome className="mb-6 -ms-2.5" />
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="mb-1 text-2xl font-medium tracking-tight">זמן ומשימות</h1>
          <p className="text-sm text-muted">ניהול חכם של המשימות והזמן שלך.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handlePrioritize}
            disabled={prioritizing || todoTasks.length === 0}
            className="focus-ring flex items-center gap-1.5 rounded-lg bg-accent-time/20 px-4 py-2 text-sm font-medium text-accent-time transition-opacity hover:opacity-80 disabled:opacity-40"
          >
            {prioritizing ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Wand2 size={14} aria-hidden />}
            {prioritizing ? "מתעדף…" : "תעדף עם AI"}
          </button>
          <button
            onClick={() => setEventModalOpen(true)}
            className="focus-ring flex items-center gap-1.5 rounded-lg bg-accent-time/20 px-4 py-2 text-sm font-medium text-accent-time transition-opacity hover:opacity-80"
          >
            <CalendarPlus size={14} aria-hidden />
            אירוע חדש
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

      {(toggleError || deleteError || prioritizeError || deleteEventError) && (
        <p className="mb-6 text-xs text-accent-family">{toggleError ?? deleteError ?? prioritizeError ?? deleteEventError}</p>
      )}

      <TaskSuggestions
        events={openEvents}
        shifts={dayShifts}
        habits={habits}
        habitLogs={habitLogs}
        selectedDate={selectedDate}
        existingTasks={tasks.filter((t) => t.status !== "done")}
      />

      {/* The weekly skeleton sits above the day view on purpose: it is the
          thing that explains the day, and it is the surface people come here
          to edit when their term or shift pattern changes. */}
      <GlassCard className="mb-8">
        <p className="mb-1 flex items-center gap-2 text-sm font-medium text-muted">
          <CalendarRange size={16} className="text-accent-time" aria-hidden />
          הלוז השבועי
        </p>
        <p className="mb-4 text-xs text-muted">
          השלד הקבוע של השבוע שלך. על בסיסו האפליקציה יודעת מה עכשיו, מה הבא, ומתי אתה באמת פנוי.
        </p>
        <WeeklySchedule />
      </GlassCard>

      <DayCarousel selectedDate={selectedDate} onSelect={setSelectedDate} />
      <div className="mb-10">
        <Timeline
          rows={timelineRows}
          onToggleTaskDone={handleToggleDone}
          onDeleteManualEvent={handleDeleteManualEvent}
          selectedDate={selectedDate}
          isToday={isSelectedToday}
          openEvents={openEvents}
          openTasks={openTasks}
          shifts={dayShifts}
          people={people}
        />
      </div>

      {prioritizing && (
        <GlassCard delay={0} className="mb-6 flex items-center justify-center gap-3 py-6">
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

      <h2 className="mb-4 text-lg font-medium tracking-tight text-foreground">כל המשימות</h2>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section>
          <h3 className="mb-3 text-sm font-medium text-muted">לביצוע ({todoTasks.length})</h3>
          <PinnedList
            items={todoTasks}
            getKey={(task) => task.id}
            isPinned={(task) => task.isHighPriority}
            onTogglePin={handleTogglePin}
            empty={<p className="text-sm text-muted">אין משימות לביצוע. הוסף משימה חדשה כדי להתחיל.</p>}
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
        </section>

        <section>
          <h3 className="mb-3 text-sm font-medium text-muted">בוצע ({doneTasks.length})</h3>
          <PinnedList
            items={doneTasks}
            getKey={(task) => task.id}
            isPinned={(task) => task.isHighPriority}
            onTogglePin={handleTogglePin}
            empty={<p className="text-sm text-muted">עדיין לא הושלמו משימות.</p>}
          >
            {(task, { pinned, togglePin }) => (
              <TaskCard
                task={task}
                delay={0}
                onToggleDone={handleToggleDone}
                onDelete={handleDelete}
                pinned={pinned}
                onTogglePin={togglePin}
              />
            )}
          </PinnedList>
        </section>
      </div>

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
