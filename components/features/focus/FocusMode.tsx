"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Focus, Pause, Play, X } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import {
  DEFAULT_FOCUS_MINUTES,
  pause as pauseSession,
  progressOf,
  resume as resumeSession,
  startSession,
  type FocusSession,
} from "@/lib/focus/focusSession";
import { cn } from "@/lib/utils";
import type { Task } from "@/types";

const TICK_MS = 1000;

interface FocusModeProps {
  /** The task to focus on. Untethered when omitted. */
  task?: Task | null;
  onClose: () => void;
}

// Deep-work overlay.
//
// All timer arithmetic lives in lib/focus/focusSession.ts, which is pure and
// tested — this component only ticks a clock and renders. That split is why
// pause/resume correctness is verifiable without mounting anything.
//
// The overlay covers the app rather than dimming it: the point of a focus
// mode is that the rest of the UI stops competing for attention, and a
// translucent scrim still leaves everything readable behind it.
export function FocusMode({ task, onClose }: FocusModeProps) {
  const reduce = useReducedMotion();
  const updateTask = useAtlasStore((s) => s.updateTask);

  const [session, setSession] = useState<FocusSession>(() =>
    startSession({ taskId: task?.id ?? null, taskTitle: task?.title ?? null, now: Date.now() })
  );
  const [now, setNow] = useState(() => Date.now());

  const progress = progressOf(session, now);

  // One interval for the whole overlay. Reading Date.now() each tick rather
  // than counting ticks keeps the timer honest when the tab is backgrounded
  // and setInterval is throttled.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const close = useCallback(() => onClose(), [onClose]);

  // Escape leaves focus mode — a full-screen overlay with no keyboard exit
  // is a trap.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [close]);

  // Announce completion once, not on every tick after it.
  const announced = useRef(false);
  useEffect(() => {
    if (progress.isComplete) announced.current = true;
  }, [progress.isComplete]);

  function markDone() {
    if (task) updateTask(task.id, { status: "done" }).catch(() => {});
    close();
  }

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="מצב ריכוז"
      initial={reduce ? { opacity: 1 } : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-8 bg-background px-6"
    >
      <button
        onClick={close}
        aria-label="צא ממצב ריכוז"
        className="glass-control focus-ring absolute end-6 top-6 grid size-10 place-items-center rounded-full text-foreground"
      >
        <X size={18} aria-hidden />
      </button>

      <p className="flex items-center gap-2 text-sm text-muted">
        <Focus size={15} className="text-gold-ink" aria-hidden />
        מצב ריכוז
      </p>

      {session.taskTitle ? (
        <h2 className="max-w-xl text-balance text-center text-2xl font-medium text-foreground sm:text-3xl">
          {session.taskTitle}
        </h2>
      ) : (
        <h2 className="text-2xl font-medium text-muted">עבודה עמוקה</h2>
      )}

      {/* The clock. tabular-nums so the digits don't jitter as they change. */}
      <div className="flex flex-col items-center gap-4">
        <span
          className="ltr text-6xl font-semibold tabular-nums text-foreground sm:text-7xl"
          role="timer"
          aria-live="off"
        >
          {progress.display}
        </span>

        <div
          className="h-1 w-56 overflow-hidden rounded-full bg-fill-subtle"
          role="progressbar"
          aria-valuenow={Math.round(progress.fraction * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="התקדמות מפגש הריכוז"
        >
          <div
            className={cn("h-full rounded-full transition-[width] duration-1000 ease-linear", progress.isComplete ? "bg-accent-health" : "bg-[var(--gold)]")}
            style={{ width: `${progress.fraction * 100}%` }}
          />
        </div>

        {progress.isComplete && (
          <p className="text-sm text-accent-health">המפגש הסתיים. אפשר לקחת הפסקה.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {!progress.isComplete &&
          (progress.isPaused ? (
            <button
              onClick={() => setSession((s) => resumeSession(s, Date.now()))}
              className="glass-control focus-ring flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm text-foreground"
            >
              <Play size={14} aria-hidden />
              המשך
            </button>
          ) : (
            <button
              onClick={() => setSession((s) => pauseSession(s, Date.now()))}
              className="glass-control focus-ring flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm text-foreground"
            >
              <Pause size={14} aria-hidden />
              השהה
            </button>
          ))}

        {progress.isComplete && (
          <button
            onClick={() => {
              setSession(
                startSession({
                  taskId: session.taskId,
                  taskTitle: session.taskTitle,
                  durationMinutes: DEFAULT_FOCUS_MINUTES,
                  now: Date.now(),
                })
              );
              announced.current = false;
            }}
            className="glass-control focus-ring flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm text-foreground"
          >
            <Play size={14} aria-hidden />
            מפגש נוסף
          </button>
        )}

        {task && (
          <button
            onClick={markDone}
            className="glass-control focus-ring flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm text-accent-health"
          >
            <Check size={14} aria-hidden />
            סיימתי את המשימה
          </button>
        )}
      </div>

      <p className="text-xs text-muted">Esc ליציאה</p>
    </motion.div>
  );
}

/** Mounts the overlay only while active, so its interval doesn't run idle. */
export function FocusModeHost({ task, open, onClose }: { task?: Task | null; open: boolean; onClose: () => void }) {
  return <AnimatePresence>{open && <FocusMode task={task} onClose={onClose} />}</AnimatePresence>;
}
