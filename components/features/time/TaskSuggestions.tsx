"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, Plus, Sparkles } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { useApiCall } from "@/hooks/useApiCall";
import { useAtlasStore } from "@/store/useAtlasStore";
import { cn } from "@/lib/utils";
import type { WeekCalendarEvent } from "@/lib/time/buildDailyTimeline";
import type { Habit, HabitLog, Task, Transaction } from "@/types";

interface TaskSuggestion {
  title: string;
  estimated_minutes: number;
  category: string;
}

interface TaskSuggestionsProps {
  events: WeekCalendarEvent[];
  shifts: Transaction[];
  habits: Habit[];
  habitLogs: HabitLog[];
  selectedDate: string;
  existingTasks: Task[];
}

// Time & Tasks Space's "AI Task Suggestions" — one button that sends
// today's real events/shift/habit-completion state to
// /api/ai/suggest-tasks and renders the result as tap-to-add chips. Each
// chip adds the task via the exact same addTask the manual "משימה חדשה"
// modal uses, then flips to a checked/done visual state rather than
// disappearing — so the user can see at a glance which suggestions they've
// already acted on without the row of chips reflowing under their thumb.
export function TaskSuggestions({ events, shifts, habits, habitLogs, selectedDate, existingTasks }: TaskSuggestionsProps) {
  const addTask = useAtlasStore((s) => s.addTask);
  const [suggestions, setSuggestions] = useState<TaskSuggestion[] | null>(null);
  const [addedTitles, setAddedTitles] = useState<Set<string>>(new Set());

  const {
    loading: fetching,
    error: fetchError,
    run: fetchSuggestions,
  } = useApiCall(async () => {
    const res = await fetch("/api/ai/suggest-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        events: events.map((e) => ({
          title: e.title,
          start_time: e.start_time,
          end_time: e.end_time,
          is_all_day: e.is_all_day,
        })),
        shifts: shifts
          .filter((t) => t.shiftStart && t.shiftEnd)
          .map((t) => ({ employer: t.employer, startTime: t.shiftStart as string, endTime: t.shiftEnd as string })),
        habits: habits.map((h) => ({
          title: h.title,
          completedToday: habitLogs.some((l) => l.habitId === h.id && l.completedDate === selectedDate),
        })),
        existingTasks: existingTasks.map((t) => t.title),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "יצירת ההצעות נכשלה. נסה שוב.");
    setSuggestions((data.suggestions ?? []) as TaskSuggestion[]);
    setAddedTitles(new Set());
  });

  const { error: addError, run: addSuggested } = useApiCall(async (suggestion: TaskSuggestion) => {
    await addTask({ title: suggestion.title, description: `⏱ ${suggestion.estimated_minutes} דק׳ · ${suggestion.category}` });
    setAddedTitles((prev) => new Set(prev).add(suggestion.title));
  });

  function handleFetch() {
    if (fetching) return;
    fetchSuggestions().catch(() => {
      // error is already captured in fetchError for display below
    });
  }

  function handleAdd(suggestion: TaskSuggestion) {
    if (addedTitles.has(suggestion.title)) return;
    addSuggested(suggestion).catch(() => {
      // error is already captured in addError for display below
    });
  }

  return (
    <GlassCard delay={0} className="mb-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Sparkles size={15} className="text-accent-time" aria-hidden />
            הצעות AI למשימות
          </p>
          <p className="mt-0.5 text-xs text-muted">כמה משימות קטנות שמתאימות ליום שלך — מוכנות להוספה בלחיצה.</p>
        </div>
        <button
          onClick={handleFetch}
          disabled={fetching}
          className="focus-ring flex shrink-0 items-center gap-1.5 rounded-lg bg-accent-time/20 px-4 py-2 text-sm font-medium text-accent-time transition-opacity hover:opacity-80 disabled:opacity-60"
        >
          {fetching ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
          {fetching ? "חושב על משימות…" : suggestions ? "רענן הצעות" : "קבל הצעות"}
        </button>
      </div>

      {(fetchError || addError) && <p className="mt-2 text-xs text-accent-family">{fetchError ?? addError}</p>}

      <AnimatePresence>
        {suggestions && suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="mt-3.5 flex flex-wrap gap-2 overflow-hidden"
          >
            {suggestions.map((suggestion, i) => {
              const added = addedTitles.has(suggestion.title);
              return (
                <motion.button
                  key={suggestion.title}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: Math.min(i * 0.05, 0.2), ease: "easeOut" }}
                  onClick={() => handleAdd(suggestion)}
                  disabled={added}
                  className={cn(
                    "focus-ring flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-all",
                    added
                      ? "border-accent-time/30 bg-accent-time/10 text-muted"
                      : "border-glass-border bg-white/5 text-foreground hover:scale-[1.03] hover:border-accent-time/50 hover:bg-accent-time/10"
                  )}
                >
                  {added ? (
                    <Check size={11} className="shrink-0 text-accent-time" aria-hidden />
                  ) : (
                    <Plus size={11} className="shrink-0" aria-hidden />
                  )}
                  <span className={cn(added && "line-through")}>{suggestion.title}</span>
                  <span className="ltr text-muted">· {suggestion.estimated_minutes} דק׳</span>
                  <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-muted">
                    {suggestion.category}
                  </span>
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {suggestions && suggestions.length === 0 && !fetching && (
        <p className="mt-3.5 text-xs text-muted">אין כרגע הצעות חדשות — היום שלך נראה מכוסה.</p>
      )}
    </GlassCard>
  );
}
