"use client";

import type { CSSProperties } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, Banknote, BookOpen, CalendarClock, HeartHandshake, Loader2, Sparkles, StickyNote, X } from "lucide-react";
import { VOICE_MODULE_META, type VoiceIntentType, type VoiceUnresolvedItem } from "@/lib/voice/multiIntentParser";
import type { VoiceCompanionAction } from "@/hooks/useVoiceCompanion";
import { cn } from "@/lib/utils";

const INTENT_ICON: Record<VoiceIntentType, typeof Sparkles> = {
  TASK_CREATE: CalendarClock,
  EXPENSE_LOG: Banknote,
  LEARNING_PROGRESS: BookOpen,
  FAMILY_NOTE: HeartHandshake,
  NOTE_CAPTURE: StickyNote,
};

interface ActionBreakdownDrawerProps {
  actions: VoiceCompanionAction[];
  unresolved: VoiceUnresolvedItem[];
  committing: boolean;
  onRemove: (key: string) => void;
  onExecuteAll: () => void;
}

/**
 * The reviewable breakdown of what the model heard: one color-coded Bento
 * chip per recognized action (green finance, blue learning, the app's own
 * per-life-area accent tokens — see VOICE_MODULE_META), each removable
 * before anything is written, plus a single "בצע הכל" that commits the
 * whole surviving list at once. Nothing here writes on its own — that's
 * executeAll, called only from the button below.
 */
export function ActionBreakdownDrawer({ actions, unresolved, committing, onRemove, onExecuteAll }: ActionBreakdownDrawerProps) {
  const reduce = Boolean(useReducedMotion());

  if (actions.length === 0 && unresolved.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <AnimatePresence initial={false}>
          {actions.map((action, i) => {
            const Icon = INTENT_ICON[action.intent];
            const meta = VOICE_MODULE_META[action.intent];
            return (
              <motion.div
                key={action.key}
                layout
                initial={reduce ? false : { opacity: 0, y: 10, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? undefined : { opacity: 0, scale: 0.9 }}
                transition={reduce ? { duration: 0 } : { delay: Math.min(i * 0.05, 0.25), type: "spring", bounce: 0.25 }}
                style={
                  {
                    "--chip-accent": `var(${meta.colorVar})`,
                    borderColor: "color-mix(in srgb, var(--chip-accent) 30%, transparent)",
                    background: "color-mix(in srgb, var(--chip-accent) 6%, transparent)",
                  } as CSSProperties
                }
                className="flex items-start gap-2.5 rounded-2xl border px-3 py-2.5"
              >
                <span
                  className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: "color-mix(in srgb, var(--chip-accent) 15%, transparent)", color: "var(--chip-accent)" }}
                >
                  <Icon size={14} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-medium" style={{ color: "var(--chip-accent)" }}>
                    {meta.label}
                  </p>
                  <p className="text-xs leading-snug text-foreground">{action.summary}</p>
                </div>
                <button
                  onClick={() => onRemove(action.key)}
                  aria-label="הסר פעולה"
                  className="focus-ring shrink-0 rounded-lg p-1 text-muted transition-colors hover:text-accent-family"
                >
                  <X size={12} aria-hidden />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {unresolved.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-2xl border border-dashed border-hairline-card px-3 py-2.5">
          {unresolved.map((item, i) => (
            <p key={i} className="flex items-start gap-2 text-xs text-muted">
              <AlertCircle size={13} className="mt-0.5 shrink-0 text-accent-fitness" aria-hidden />
              <span>
                {item.reason}
                {item.label ? ` — "${item.label}"` : ""}
              </span>
            </p>
          ))}
        </div>
      )}

      {actions.length > 0 && (
        <button
          onClick={onExecuteAll}
          disabled={committing}
          className={cn(
            "focus-ring flex items-center justify-center gap-2 rounded-xl bg-accent-faith px-4 py-2.5 text-sm font-semibold text-background transition-opacity disabled:opacity-60"
          )}
        >
          {committing ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
          {committing ? "רושם…" : `בצע הכל (${actions.length})`}
        </button>
      )}
    </div>
  );
}
