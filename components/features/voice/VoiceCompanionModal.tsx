"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, Keyboard, Mic, Send, Square, X } from "lucide-react";
import { Modal, Z_INDEX } from "@/components/ui/Modal";
import { UndoToast } from "@/components/ui/UndoToast";
import { AudioWaveVisualizer } from "@/components/features/voice/AudioWaveVisualizer";
import { ActionBreakdownDrawer } from "@/components/features/voice/ActionBreakdownDrawer";
import { useVoiceCompanion } from "@/hooks/useVoiceCompanion";
import { VOICE_COMPANION_OPEN_EVENT } from "@/lib/voice/voiceCompanionEvent";
import { cn } from "@/lib/utils";

/**
 * The Executive Voice Companion: a global, single-gesture entry point that
 * decomposes one spoken (or typed) stream-of-consciousness line into several
 * simultaneous actions across Tasks, Finance, Learning and Family CRM. Mounted
 * once (components/layout/AppShell.tsx) and opened from anywhere via
 * requestVoiceCompanion() — the Sidebar's mic button holds no reference to
 * this component, the same decoupling lib/companion/sosEvent.ts already uses
 * for the AI Companion's SOS mode.
 */
export function VoiceCompanionModal() {
  const [open, setOpen] = useState(false);
  const reduceMotion = Boolean(useReducedMotion());
  const [fallbackMode, setFallbackMode] = useState(false);
  const [fallbackText, setFallbackText] = useState("");
  // A distress message hands off to the AI Companion's own SOS panel
  // (components/layout/AICompanion.tsx) — this modal must close, not just
  // reset, or its dimmed backdrop sits on top of and hides that panel
  // entirely (both are centered Modal instances).
  const voice = useVoiceCompanion(() => {
    setOpen(false);
    setFallbackMode(false);
    setFallbackText("");
  });

  useEffect(() => {
    function handleOpen() {
      setOpen(true);
      setFallbackMode(!voice.micSupported);
    }
    window.addEventListener(VOICE_COMPANION_OPEN_EVENT, handleOpen);
    return () => window.removeEventListener(VOICE_COMPANION_OPEN_EVENT, handleOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function close() {
    setOpen(false);
    setFallbackMode(false);
    setFallbackText("");
    voice.stopListening();
    voice.reset();
  }

  function handleFallbackSubmit() {
    if (!fallbackText.trim()) return;
    voice.submitText(fallbackText);
    setFallbackText("");
  }

  const { phase } = voice;

  return (
    <>
      <Modal
        open={open}
        onClose={close}
        align="center"
        zIndex={Z_INDEX.modal}
        label="קומפניון קולי"
        panelClassName="relative w-full max-w-md overflow-hidden p-5"
      >
        {/* Ambient backdrop glow: a soft pulsing radial gradient behind the
            recording area, matching the Learning Lab's Ambient orb language
            (blur-3xl, opacity pulse) at modal scale rather than full-page —
            this panel is centered and doesn't own the page background. Off
            entirely under reduced motion. */}
        {!reduceMotion && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-10 -z-10 size-64 -translate-x-1/2 rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--accent-faith) 35%, transparent), transparent 70%)" }}
            animate={{ opacity: phase === "listening" ? [0.5, 0.9, 0.5] : [0.25, 0.4, 0.25], scale: phase === "listening" ? [1, 1.15, 1] : [1, 1.05, 1] }}
            transition={{ duration: phase === "listening" ? 1.8 : 3.2, repeat: Infinity, ease: "easeInOut" }}
          />
        )}

        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Mic size={16} className="text-accent-faith" aria-hidden />
            קומפניון קולי
          </h2>
          <div className="flex items-center gap-1">
            {voice.micSupported && (
              <button
                onClick={() => setFallbackMode((v) => !v)}
                aria-label={fallbackMode ? "עבור להקלטה" : "הקלד במקום"}
                className="focus-ring rounded-lg p-1.5 text-muted transition-colors hover:bg-fill-subtle hover:text-foreground"
              >
                {fallbackMode ? <Mic size={16} aria-hidden /> : <Keyboard size={16} aria-hidden />}
              </button>
            )}
            <button onClick={close} aria-label="סגור" className="focus-ring rounded-lg p-1.5 text-muted transition-colors hover:bg-fill-subtle hover:text-foreground">
              <X size={18} aria-hidden />
            </button>
          </div>
        </div>

        {(phase === "idle" || phase === "listening" || phase === "error") && !fallbackMode && (
          <div className="flex flex-col items-center gap-4 py-2">
            <AudioWaveVisualizer active={phase === "listening"} />

            <p className="min-h-10 max-w-sm text-center text-sm leading-relaxed text-foreground" dir="rtl">
              {phase === "listening" ? voice.transcript || "מקשיב…" : "לחץ והתחל לדבר — אפשר לשלב כמה דברים במשפט אחד."}
            </p>

            <button
              onClick={phase === "listening" ? voice.stopListening : voice.startListening}
              aria-label={phase === "listening" ? "עצור הקלטה" : "התחל הקלטה"}
              className={cn(
                "focus-ring flex size-16 items-center justify-center rounded-full text-background shadow-lg transition-transform active:scale-95",
                phase === "listening" ? "bg-accent-family" : "bg-accent-faith"
              )}
            >
              {phase === "listening" ? <Square size={22} aria-hidden /> : <Mic size={24} aria-hidden />}
            </button>

            {phase === "error" && voice.error && (
              <p className="flex items-center gap-1.5 text-xs text-accent-family">
                <AlertCircle size={13} aria-hidden />
                {voice.error}
              </p>
            )}
          </div>
        )}

        {(fallbackMode || !voice.micSupported) && (phase === "idle" || phase === "error") && (
          <div className="flex flex-col gap-2">
            <textarea
              value={fallbackText}
              onChange={(e) => setFallbackText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleFallbackSubmit();
                }
              }}
              placeholder='למדתי היום פרק על פיזיקה, הוצאתי 50 שקל על דלק, ותזכיר לי לדבר עם אבא בערב…'
              aria-label="כתוב מה שברצונך לרשום"
              rows={3}
              autoFocus
              className="focus-ring resize-none rounded-xl bg-fill-subtle px-3 py-2.5 text-sm text-foreground placeholder:text-muted"
            />
            <button
              onClick={handleFallbackSubmit}
              disabled={!fallbackText.trim()}
              className="focus-ring flex items-center justify-center gap-1.5 self-end rounded-xl bg-accent-faith/15 px-4 py-2 text-sm font-medium text-accent-faith transition-opacity disabled:opacity-40"
            >
              <Send size={14} aria-hidden />
              שלח
            </button>
            {voice.error && (
              <p className="flex items-center gap-1.5 text-xs text-accent-family">
                <AlertCircle size={13} aria-hidden />
                {voice.error}
              </p>
            )}
          </div>
        )}

        {phase === "processing" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <motion.div
              animate={reduceMotion ? undefined : { rotate: 360 }}
              transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
              className="size-8 rounded-full border-2 border-accent-faith/25 border-t-accent-faith"
            />
            <p className="text-sm text-muted">מפרק את מה שאמרת…</p>
          </div>
        )}

        {(phase === "reviewing" || phase === "committing") && (
          <ActionBreakdownDrawer
            actions={voice.actions}
            unresolved={voice.unresolved}
            committing={phase === "committing"}
            onRemove={voice.removeAction}
            onExecuteAll={voice.executeAll}
          />
        )}

        {phase === "reviewing" && voice.error && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-accent-family">
            <AlertCircle size={13} aria-hidden />
            {voice.error}
          </p>
        )}

        {open && (
          <div className="mt-3">
            <UndoToast toast={voice.undoToast.toast} onUndo={voice.undoToast.undo} onDismiss={voice.undoToast.dismiss} onPause={voice.undoToast.setPaused} />
          </div>
        )}
      </Modal>

      {!open && (
        <UndoToast
          toast={voice.undoToast.toast}
          onUndo={voice.undoToast.undo}
          onDismiss={voice.undoToast.dismiss}
          onPause={voice.undoToast.setPaused}
          className={cn("fixed bottom-36 left-4 w-[calc(100%-2rem)] max-w-sm sm:bottom-6 sm:left-8", Z_INDEX.panel)}
        />
      )}
    </>
  );
}
