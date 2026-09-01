"use client";

import { useState } from "react";
import { Check, Plus, Repeat, Trash2 } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { useApiCall } from "@/hooks/useApiCall";
import { useAtlasStore } from "@/store/useAtlasStore";
import { cn } from "@/lib/utils";

interface HabitsSectionProps {
  selectedDate: string;
}

// Replaces the Timeline's old static "Habits — coming soon" row. Whether
// a habit is checked is derived live from habitLogs for selectedDate —
// no per-habit "isDone" flag to keep in sync, so switching the Day
// Carousel to a different date just re-renders with a different
// completion state for free.
export function HabitsSection({ selectedDate }: HabitsSectionProps) {
  const habits = useAtlasStore((s) => s.habits);
  const habitLogs = useAtlasStore((s) => s.habitLogs);
  const addHabit = useAtlasStore((s) => s.addHabit);
  const deleteHabit = useAtlasStore((s) => s.deleteHabit);
  const toggleHabitCompletion = useAtlasStore((s) => s.toggleHabitCompletion);

  const [addingOpen, setAddingOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const { loading: creating, error: createError, run: createHabit } = useApiCall(addHabit);
  const { error: toggleError, run: runToggle } = useApiCall(toggleHabitCompletion);
  const { error: deleteError, run: runDelete } = useApiCall(deleteHabit);

  function isCompletedOn(habitId: string): boolean {
    return habitLogs.some((l) => l.habitId === habitId && l.completedDate === selectedDate);
  }

  function handleToggle(habitId: string) {
    const nextCompleted = !isCompletedOn(habitId);
    runToggle(habitId, selectedDate, nextCompleted).catch(() => {
      // error is already captured in toggleError for display below
    });
  }

  function handleAdd() {
    const title = newTitle.trim();
    if (!title || creating) return;
    createHabit({ title })
      .then(() => {
        setNewTitle("");
        setAddingOpen(false);
      })
      .catch(() => {
        // error is already captured in createError for display below
      });
  }

  function handleDeleteClick(habitId: string) {
    if (confirmingDeleteId !== habitId) {
      setConfirmingDeleteId(habitId);
      return;
    }
    setConfirmingDeleteId(null);
    runDelete(habitId).catch(() => {
      // error is already captured in deleteError for display below
    });
  }

  return (
    <GlassCard className="p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs text-muted">
        <Repeat size={12} aria-hidden />
        הרגלים יומיים
      </p>

      <div className="flex flex-col gap-2">
        {habits.map((habit) => {
          const done = isCompletedOn(habit.id);
          return (
            <div key={habit.id} className="flex items-center gap-2">
              <button
                onClick={() => handleToggle(habit.id)}
                aria-label={done ? `סמן את "${habit.title}" כלא בוצע היום` : `סמן את "${habit.title}" כבוצע היום`}
                className={cn(
                  "focus-ring flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                  done
                    ? "border-accent-time bg-accent-time/20 text-accent-time"
                    : "border-glass-border text-transparent hover:border-accent-time/60"
                )}
              >
                <Check size={11} aria-hidden />
              </button>
              <span className={cn("min-w-0 flex-1 truncate text-sm", done ? "text-muted line-through" : "text-foreground")}>
                {habit.title}
              </span>

              {confirmingDeleteId === habit.id ? (
                <div className="flex shrink-0 items-center gap-1.5 text-xs">
                  <button
                    onClick={() => handleDeleteClick(habit.id)}
                    className="focus-ring rounded-lg bg-accent-family/20 px-2 py-0.5 font-medium text-accent-family transition-opacity hover:opacity-80"
                  >
                    מחק
                  </button>
                  <button
                    onClick={() => setConfirmingDeleteId(null)}
                    className="focus-ring text-muted transition-colors hover:text-foreground"
                  >
                    ביטול
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => handleDeleteClick(habit.id)}
                  aria-label={`מחק את ${habit.title}`}
                  className="focus-ring shrink-0 rounded-lg p-1 text-muted transition-colors hover:text-accent-family"
                >
                  <Trash2 size={12} aria-hidden />
                </button>
              )}
            </div>
          );
        })}

        {habits.length === 0 && !addingOpen && <p className="text-xs text-muted">אין עדיין הרגלים למעקב.</p>}

        {addingOpen ? (
          <div className="flex items-center gap-2 pt-1">
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="שם ההרגל, למשל: מדיטציה"
              aria-label="שם ההרגל החדש"
              className="focus-ring min-w-0 flex-1 rounded-lg bg-fill-subtle px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted"
            />
            <button
              onClick={handleAdd}
              disabled={!newTitle.trim() || creating}
              className="focus-ring shrink-0 rounded-lg bg-accent-time/20 px-2.5 py-1.5 text-xs font-medium text-accent-time transition-opacity hover:opacity-80 disabled:opacity-40"
            >
              {creating ? "מוסיף…" : "הוסף"}
            </button>
            <button
              onClick={() => {
                setAddingOpen(false);
                setNewTitle("");
              }}
              className="focus-ring shrink-0 text-xs text-muted transition-colors hover:text-foreground"
            >
              ביטול
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAddingOpen(true)}
            className="focus-ring flex w-fit items-center gap-1 pt-1 text-xs text-muted transition-colors hover:text-accent-time"
          >
            <Plus size={12} aria-hidden />
            הוסף הרגל
          </button>
        )}

        {(createError || toggleError || deleteError) && (
          <p className="text-xs text-accent-family">{createError ?? toggleError ?? deleteError}</p>
        )}
      </div>
    </GlassCard>
  );
}
