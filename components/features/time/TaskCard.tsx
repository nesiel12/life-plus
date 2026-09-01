"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Calendar, Check, Pin, PinOff, Star, Trash2 } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";
import type { Task } from "@/types";

interface TaskCardProps {
  task: Task;
  delay: number;
  onToggleDone: (task: Task) => void;
  onDelete: (taskId: string) => void;
  /** Supplied by PinnedList. Without it the card falls back to the plain
   *  high-priority star and shows no pin affordance. */
  pinned?: boolean;
  onTogglePin?: () => void;
}

function formatDueDate(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Binary done/not-done checkbox only, per the Time & Tasks Space's first
// pass — 'in-progress' is a real status the schema and updateTask already
// support (for the Personal DNA-driven auto-prioritization this phase
// anticipates), just not surfaced as a third checkbox state yet.
export function TaskCard({ task, delay, onToggleDone, onDelete, pinned, onTogglePin }: TaskCardProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const isDone = task.status === "done";

  function handleDeleteClick() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    onDelete(task.id);
  }

  return (
    <GlassCard
      delay={delay}
      className={cn("group/task p-4", task.isHighPriority && !onTogglePin && "ring-1 ring-accent-time/50")}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={() => onToggleDone(task)}
          aria-label={isDone ? `סמן את "${task.title}" כלא בוצע` : `סמן את "${task.title}" כבוצע`}
          className={cn(
            "focus-ring mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
            isDone
              ? "border-accent-time bg-accent-time/20 text-accent-time"
              : "border-glass-border text-transparent hover:border-accent-time/60"
          )}
        >
          <Check size={12} aria-hidden />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {task.isHighPriority && !onTogglePin && (
              <motion.span
                animate={{ opacity: [0.55, 1, 0.55] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="inline-flex shrink-0 text-accent-time"
                aria-hidden
              >
                <Star size={13} className="fill-accent-time" />
              </motion.span>
            )}
            <p className={cn("font-medium", isDone ? "text-muted line-through" : "text-foreground")}>{task.title}</p>
            {task.isHighPriority && <span className="sr-only">משימה בעדיפות גבוהה</span>}
          </div>
          {task.description && (
            <p className={cn("mt-1 text-sm leading-relaxed", isDone ? "text-muted" : "text-foreground/70")}>
              {task.description}
            </p>
          )}
          {task.dueDate && (
            <p className="mt-2 flex items-center gap-1 text-xs text-muted">
              <Calendar size={11} aria-hidden />
              <span className="ltr">{formatDueDate(task.dueDate)}</span>
            </p>
          )}
        </div>

        {onTogglePin && (
          <button
            onClick={onTogglePin}
            aria-pressed={pinned}
            aria-label={pinned ? `בטל נעיצה של ${task.title}` : `נעץ את ${task.title} לראש הרשימה`}
            className={cn(
              "focus-ring z-20 grid size-7 shrink-0 place-items-center rounded-lg transition-all duration-200",
              pinned
                ? "bg-gold-soft text-gold-ink"
                : "text-muted opacity-0 hover:bg-fill-subtle hover:text-gold-ink focus-visible:opacity-100 group-hover/task:opacity-100"
            )}
          >
            <motion.span
              key={pinned ? "pinned" : "unpinned"}
              initial={{ rotate: pinned ? -35 : 0, scale: 0.7 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 26 }}
              className="grid place-items-center"
            >
              {pinned ? <Pin size={13} aria-hidden /> : <PinOff size={13} aria-hidden />}
            </motion.span>
          </button>
        )}

        {confirmingDelete ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex shrink-0 items-center gap-1.5 text-xs"
          >
            <button
              onClick={handleDeleteClick}
              className="focus-ring rounded-lg bg-accent-family/20 px-2 py-1 font-medium text-accent-family transition-opacity hover:opacity-80"
            >
              מחק
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              className="focus-ring text-muted transition-colors hover:text-foreground"
            >
              ביטול
            </button>
          </motion.div>
        ) : (
          <button
            onClick={handleDeleteClick}
            aria-label={`מחק את ${task.title}`}
            className="focus-ring shrink-0 rounded-lg p-1 text-muted transition-colors hover:text-accent-family"
          >
            <Trash2 size={14} aria-hidden />
          </button>
        )}
      </div>
    </GlassCard>
  );
}
