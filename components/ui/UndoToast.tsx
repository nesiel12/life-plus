"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Undo2, X } from "lucide-react";
import type { UndoToastState } from "@/hooks/useUndoToast";
import { cn } from "@/lib/utils";

interface UndoToastProps {
  toast: UndoToastState | null;
  onUndo: () => void;
  onDismiss: () => void;
  onPause: (paused: boolean) => void;
  /** Positioning is the caller's: the Companion places it inside its own panel
   *  while open and fixed to the viewport while closed. */
  className?: string;
}

const RESULT_TEXT = {
  undone: "בוטל.",
  failed: "הביטול לא נשמר.",
} as const;

export function UndoToast({ toast, onUndo, onDismiss, onPause, className }: UndoToastProps) {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.id}
          // polite: it reports what just happened, it does not interrupt.
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          onMouseEnter={() => onPause(true)}
          onMouseLeave={() => onPause(false)}
          onFocus={() => onPause(true)}
          onBlur={() => onPause(false)}
          className={cn(
            "glass-panel glass-glow flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-foreground shadow-xl",
            className
          )}
        >
          <Check size={14} className="shrink-0 text-accent-health" aria-hidden />
          <span className="min-w-0 flex-1 truncate">
            {toast.status === "undone" || toast.status === "failed" ? RESULT_TEXT[toast.status] : toast.summary}
          </span>
          {(toast.status === "idle" || toast.status === "undoing") && (
            <button
              onClick={onUndo}
              disabled={toast.status === "undoing"}
              className="focus-ring flex shrink-0 items-center gap-1 rounded-lg bg-fill-subtle px-2 py-1 text-xs font-medium text-accent-faith transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              <Undo2 size={12} aria-hidden />
              {toast.status === "undoing" ? "מבטל…" : "בטל"}
            </button>
          )}
          <button
            onClick={onDismiss}
            aria-label="סגור הודעה"
            className="focus-ring shrink-0 rounded-lg p-1 text-muted transition-colors hover:text-foreground"
          >
            <X size={12} aria-hidden />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
