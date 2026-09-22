"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Loader2, MessageCircle, Trash2, X } from "lucide-react";
import {
  deleteVoiceSessionAction,
  listVoiceMessagesAction,
  listVoiceSessionsAction,
  type VoiceMessage,
  type VoiceSession,
} from "@/app/actions/voiceHistory";
import { cn } from "@/lib/utils";

interface VoiceHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
}

function relativeLabel(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "עכשיו";
  if (minutes < 60) return `לפני ${minutes} דק׳`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `לפני ${hours} שע׳`;
  const days = Math.round(hours / 24);
  return `לפני ${days} ימים`;
}

/**
 * היסטוריית שיחות קוליות — a local overlay within VoiceAssistantModal's own
 * panel (same "absolutely-positioned overlay, not a second nested Modal"
 * pattern components/layout/AICompanion.tsx's clear-chat confirmation
 * uses — Modal's focus trap keys off its own `open` state and a second live
 * Modal would register a second, uncoordinated one). Two views: the session
 * list, and one session's read-only transcript.
 */
export function VoiceHistoryDrawer({ open, onClose }: VoiceHistoryDrawerProps) {
  const reduceMotion = Boolean(useReducedMotion());
  const [sessions, setSessions] = useState<VoiceSession[] | null>(null);
  const [selected, setSelected] = useState<VoiceSession | null>(null);
  const [messages, setMessages] = useState<VoiceMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setMessages(null);
    setError(null);
    listVoiceSessionsAction()
      .then(setSessions)
      .catch(() => setError("לא הצלחנו לטעון את ההיסטוריה."));
  }, [open]);

  function openSession(session: VoiceSession) {
    setSelected(session);
    setMessages(null);
    listVoiceMessagesAction(session.id)
      .then(setMessages)
      .catch(() => setError("לא הצלחנו לטעון את השיחה."));
  }

  function removeSession(sessionId: string) {
    setSessions((current) => current?.filter((s) => s.id !== sessionId) ?? current);
    deleteVoiceSessionAction(sessionId).catch(() => {
      // Best-effort: a failed delete just leaves the row for next time.
    });
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={reduceMotion ? undefined : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label="היסטוריית שיחות קוליות"
          className="absolute inset-0 z-20 flex flex-col rounded-2xl bg-surface p-4"
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {selected && (
                <button onClick={() => setSelected(null)} aria-label="חזרה לרשימה" className="focus-ring rounded-lg p-1 text-muted hover:text-foreground">
                  <ArrowRight size={16} aria-hidden />
                </button>
              )}
              <h3 className="text-sm font-semibold text-foreground">{selected ? selected.title || "שיחה" : "היסטוריית שיחות קוליות"}</h3>
            </div>
            <button onClick={onClose} aria-label="סגור היסטוריה" className="focus-ring rounded-lg p-1 text-muted hover:text-foreground">
              <X size={16} aria-hidden />
            </button>
          </div>

          {error && <p className="text-xs text-accent-family">{error}</p>}

          {!selected ? (
            <div className="flex-1 overflow-y-auto">
              {sessions === null ? (
                <div className="flex justify-center py-8">
                  <Loader2 size={18} className="animate-spin text-muted" aria-hidden />
                </div>
              ) : sessions.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted">עדיין אין שיחות שמורות.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {sessions.map((session) => (
                    <li key={session.id} className="flex items-center gap-1.5">
                      <button
                        onClick={() => openSession(session)}
                        className="focus-ring flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-fill-subtle px-3 py-2 text-start transition-colors hover:bg-fill-subtle/70"
                      >
                        <MessageCircle size={14} className="shrink-0 text-accent-faith" aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-xs text-foreground">{session.title || "שיחה ללא כותרת"}</span>
                        <span className="shrink-0 text-[10px] text-muted">{relativeLabel(session.updatedAt)}</span>
                      </button>
                      <button
                        onClick={() => removeSession(session.id)}
                        aria-label="מחק שיחה"
                        className="focus-ring shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:text-accent-family"
                      >
                        <Trash2 size={13} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {messages === null ? (
                <div className="flex justify-center py-8">
                  <Loader2 size={18} className="animate-spin text-muted" aria-hidden />
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed",
                        m.role === "user" ? "mr-auto bg-accent-knowledge/15 text-foreground" : "ml-auto bg-fill-subtle text-foreground"
                      )}
                    >
                      {m.content}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
