"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, Ear, History, Keyboard, Mic, Phone, PhoneOff, Send, Volume2, X } from "lucide-react";
import { Modal, Z_INDEX } from "@/components/ui/Modal";
import { UndoToast } from "@/components/ui/UndoToast";
import { AudioWaveVisualizer } from "@/components/features/voice/AudioWaveVisualizer";
import { ActionBreakdownDrawer } from "@/components/features/voice/ActionBreakdownDrawer";
import { VoiceHistoryDrawer } from "@/components/features/voice/VoiceHistoryDrawer";
import { useVoiceAssistant } from "@/hooks/useVoiceAssistant";
import { VOICE_ASSISTANT_OPEN_EVENT } from "@/lib/voice/voiceAssistantEvent";
import { cn } from "@/lib/utils";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * עוזר קולי — a real-time, bidirectional voice call interface: the person
 * speaks, the assistant replies out loud within about a second (streamed
 * text spoken sentence-by-sentence as it arrives, not held back until
 * fully generated — see lib/voice/textToSpeech.ts), and whatever the
 * utterance implies (a task, an expense, …) is extracted and offered as a
 * one-click confirmation in the background, never blocking the
 * conversation itself. Mounted once (components/layout/AppShell.tsx) and
 * opened from anywhere via requestVoiceAssistant() — the Sidebar's mic
 * button holds no reference to this component, the same decoupling
 * lib/companion/sosEvent.ts uses for the AI Companion's SOS mode.
 */
export function VoiceAssistantModal() {
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const reduceMotion = Boolean(useReducedMotion());
  const [fallbackMode, setFallbackMode] = useState(false);
  const [fallbackText, setFallbackText] = useState("");
  const [durationSec, setDurationSec] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // A distress message hands off to the AI Companion's own SOS panel
  // (components/layout/AICompanion.tsx) — this modal must close, not just
  // reset, or its dimmed backdrop sits on top of and hides that panel
  // entirely (both are centered Modal instances) — found live in the
  // previous version of this feature.
  const assistant = useVoiceAssistant(() => {
    setOpen(false);
    setFallbackMode(false);
    setFallbackText("");
  });

  useEffect(() => {
    function handleOpen() {
      setOpen(true);
      setFallbackMode(!assistant.micSupported);
      setDurationSec(0);
    }
    window.addEventListener(VOICE_ASSISTANT_OPEN_EVENT, handleOpen);
    return () => window.removeEventListener(VOICE_ASSISTANT_OPEN_EVENT, handleOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setDurationSec((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  }, [assistant.messages, assistant.transcript, reduceMotion]);

  function close() {
    setOpen(false);
    setHistoryOpen(false);
    setFallbackMode(false);
    setFallbackText("");
    assistant.stopListening();
    assistant.endSession();
  }

  function handleFallbackSubmit() {
    if (!fallbackText.trim()) return;
    assistant.submitText(fallbackText);
    setFallbackText("");
  }

  const { phase } = assistant;
  const isListening = phase === "listening";
  const isSpeaking = phase === "speaking";
  const isThinking = phase === "thinking";

  return (
    <>
      <Modal
        open={open}
        onClose={close}
        align="center"
        zIndex={Z_INDEX.modal}
        label="עוזר קולי"
        panelClassName="relative flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden p-4"
      >
        <VoiceHistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} />

        {/* Ambient backdrop glow: a soft pulsing radial gradient, brighter
            and faster while the assistant is actually speaking — the
            Learning Lab's Ambient orb language (blur-3xl, opacity pulse) at
            modal scale, not full-page, since this panel is centered and
            doesn't own the page background. Off under reduced motion. */}
        {!reduceMotion && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-8 -z-10 size-64 -translate-x-1/2 rounded-full blur-3xl"
            style={{
              background: `radial-gradient(circle, color-mix(in srgb, var(${isSpeaking ? "--gold" : "--accent-faith"}) 35%, transparent), transparent 70%)`,
            }}
            animate={{
              opacity: isListening || isSpeaking ? [0.5, 0.9, 0.5] : [0.25, 0.4, 0.25],
              scale: isListening || isSpeaking ? [1, 1.15, 1] : [1, 1.05, 1],
            }}
            transition={{ duration: isSpeaking ? 1.1 : isListening ? 1.8 : 3.2, repeat: Infinity, ease: "easeInOut" }}
          />
        )}

        {/* Header: title, live call duration, history + hands-free + fallback toggles, close. */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mic size={16} className="text-accent-faith" aria-hidden />
            <h2 className="text-sm font-semibold text-foreground">עוזר קולי</h2>
            {open && <span className="rounded-full bg-fill-subtle px-2 py-0.5 text-[10px] tabular-nums text-muted">{formatDuration(durationSec)}</span>}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => assistant.setHandsFree((v) => !v)}
              aria-pressed={assistant.handsFree}
              aria-label={assistant.handsFree ? "מצב שיחה רציפה פעיל — עבור למגע ודיבור" : "מצב מגע ודיבור פעיל — עבור לשיחה רציפה"}
              title={assistant.handsFree ? "שיחה רציפה" : "מגע ודיבור"}
              className={cn(
                "focus-ring rounded-lg p-1.5 transition-colors hover:bg-fill-subtle",
                assistant.handsFree ? "text-accent-faith" : "text-muted hover:text-foreground"
              )}
            >
              {assistant.handsFree ? <Ear size={16} aria-hidden /> : <Phone size={16} aria-hidden />}
            </button>
            <button
              onClick={() => setHistoryOpen(true)}
              aria-label="היסטוריית שיחות קוליות"
              className="focus-ring rounded-lg p-1.5 text-muted transition-colors hover:bg-fill-subtle hover:text-foreground"
            >
              <History size={16} aria-hidden />
            </button>
            {assistant.micSupported && (
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

        {/* Dual visualizers: the person's own mic level, and a distinct
            synthetic pulse for the assistant's speech (speechSynthesis
            exposes no analyzable audio stream to visualize for real) — side
            by side so it's always visible whose "turn" is active. */}
        <div className="mb-2 grid grid-cols-2 gap-2 rounded-2xl bg-fill-subtle/50 p-2">
          <div className="flex flex-col items-center gap-1">
            <AudioWaveVisualizer active={isListening} source="mic" />
            <span className={cn("text-[10px]", isListening ? "font-medium text-accent-faith" : "text-muted")}>אתה מדבר</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <AudioWaveVisualizer active={isSpeaking} source="synthetic" />
            <span className={cn("flex items-center gap-1 text-[10px]", isSpeaking ? "font-medium text-gold-ink" : "text-muted")}>
              <Volume2 size={10} aria-hidden />
              עוזר קולי מדבר
            </span>
          </div>
        </div>

        {/* Conversation stream: past turns plus the live interim transcript while listening. */}
        <div className="mb-2 flex max-h-56 min-h-[3.5rem] flex-col gap-2 overflow-y-auto rounded-2xl bg-fill-subtle/30 p-3">
          {assistant.messages.length === 0 && !assistant.transcript && (
            <p className="py-2 text-center text-xs text-muted">
              {isThinking ? "חושב…" : "לחץ על המיקרופון והתחל לדבר — אפשר לשלב כמה דברים במשפט אחד."}
            </p>
          )}
          {assistant.messages.map((m) => (
            <div
              key={m.key}
              className={cn(
                "max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed",
                m.role === "user" ? "mr-auto bg-accent-knowledge/15 text-foreground" : "ml-auto bg-surface text-foreground"
              )}
            >
              {m.content}
            </div>
          ))}
          {isListening && assistant.transcript && (
            <div className="mr-auto max-w-[85%] rounded-xl bg-accent-knowledge/15 px-3 py-2 text-sm italic leading-relaxed text-foreground/80">
              {assistant.transcript}
            </div>
          )}
          {isThinking && <div className="ml-auto flex items-center gap-1 px-1 text-xs text-muted">חושב…</div>}
          <div ref={messagesEndRef} />
        </div>

        {assistant.error && (
          <p className="mb-2 flex items-center gap-1.5 text-xs text-accent-family">
            <AlertCircle size={13} aria-hidden />
            {assistant.error}
          </p>
        )}

        {/* Push-to-talk / stop button, or the text fallback. */}
        {!fallbackMode ? (
          <div className="mb-3 flex justify-center">
            <button
              onClick={isListening ? assistant.stopListening : assistant.startListening}
              disabled={isThinking}
              aria-label={isListening ? "עצור הקלטה" : "התחל הקלטה"}
              className={cn(
                "focus-ring flex size-16 items-center justify-center rounded-full text-background shadow-lg transition-transform active:scale-95 disabled:opacity-50",
                isListening ? "bg-accent-family" : "bg-accent-faith"
              )}
            >
              {isListening ? <PhoneOff size={22} aria-hidden /> : <Mic size={24} aria-hidden />}
            </button>
          </div>
        ) : (
          <div className="mb-3 flex flex-col gap-2">
            <textarea
              value={fallbackText}
              onChange={(e) => setFallbackText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleFallbackSubmit();
                }
              }}
              placeholder="למדתי היום פרק על פיזיקה, הוצאתי 50 שקל על דלק, ותזכיר לי לדבר עם אבא בערב…"
              aria-label="כתוב מה שברצונך לומר"
              rows={2}
              className="focus-ring resize-none rounded-xl bg-fill-subtle px-3 py-2.5 text-sm text-foreground placeholder:text-muted"
            />
            <button
              onClick={handleFallbackSubmit}
              disabled={!fallbackText.trim() || isThinking}
              className="focus-ring flex items-center justify-center gap-1.5 self-end rounded-xl bg-accent-faith/15 px-4 py-2 text-sm font-medium text-accent-faith transition-opacity disabled:opacity-40"
            >
              <Send size={14} aria-hidden />
              שלח
            </button>
          </div>
        )}

        {/* Non-blocking background actions: appears/grows independently of the conversation above. */}
        <ActionBreakdownDrawer
          actions={assistant.actions}
          unresolved={assistant.unresolved}
          committing={phase === "committing"}
          onRemove={assistant.removeAction}
          onExecuteAll={assistant.executeAll}
        />

        {open && (
          <div className="mt-3">
            <UndoToast toast={assistant.undoToast.toast} onUndo={assistant.undoToast.undo} onDismiss={assistant.undoToast.dismiss} onPause={assistant.undoToast.setPaused} />
          </div>
        )}
      </Modal>

      {!open && (
        <UndoToast
          toast={assistant.undoToast.toast}
          onUndo={assistant.undoToast.undo}
          onDismiss={assistant.undoToast.dismiss}
          onPause={assistant.undoToast.setPaused}
          className={cn("fixed bottom-36 left-4 w-[calc(100%-2rem)] max-w-sm sm:bottom-6 sm:left-8", Z_INDEX.panel)}
        />
      )}
    </>
  );
}
