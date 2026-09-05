"use client";

import { useRef, useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSession } from "next-auth/react";
import { Check, Copy, Eraser, ListTodo, Pin, PinOff, Sparkles, Trash2, X, Send, Info } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { useApiCall } from "@/hooks/useApiCall";
import { Logo } from "@/components/ui/Logo";
import { Modal, Z_INDEX } from "@/components/ui/Modal";
import { BriefingSignalList, type BriefingSignal } from "@/components/features/BriefingSignalList";
import { CommandPanel } from "@/components/features/CommandPanel";
import { decodeBasedOnHeader } from "@/lib/api/basedOnHeader";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/types";

interface Briefing {
  signals: BriefingSignal[];
  conflicts: string[];
}

// No bytes for this long means the stream is stalled, not merely slow.
// Comfortably above the server's own 50s bound, so the server's cleaner
// error wins the race whenever it is the one that gives out first.
const STREAM_STALL_MS = 55_000;

const FRIENDLY_ERROR = "לא הצלחתי להתחבר כרגע. נסה שוב עוד רגע.";

// AI Companion Experience v2 (docs/ATLAS_ARCHITECTURE_VISION.md §10): the
// primary intelligence surface, not a generic chat box. Two concrete
// changes carry the weight here, both reusing existing infrastructure
// rather than adding any: (1) the empty state reuses /api/briefing — the
// same Intelligence Engine output Today's AIBriefing already renders — as
// a proactive opener instead of a static greeting line, with quick-action
// chips derived from its real signals; (2) replies stream in (streamText,
// same model/provider, see app/api/chat/route.ts) and carry a real
// "based on" list (the top-ranked signals that shaped that specific reply)
// shown as an expandable reasoning section, not a black box.
export function AICompanion() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"chat" | "command">("chat");
  const [input, setInput] = useState("");
  const user = useAtlasStore((s) => s.user);
  const chatHistory = useAtlasStore((s) => s.chatHistory);
  const addChatMessage = useAtlasStore((s) => s.addChatMessage);
  const deleteChatMessage = useAtlasStore((s) => s.deleteChatMessage);
  const clearChatHistory = useAtlasStore((s) => s.clearChatHistory);
  const togglePinChatMessage = useAtlasStore((s) => s.togglePinChatMessage);
  const addTask = useAtlasStore((s) => s.addTask);
  const scrollRef = useRef<HTMLDivElement>(null);
  const displayName = session?.user?.name ?? user.hebrewName;

  const [sending, setSending] = useState(false);
  const [streamingReply, setStreamingReply] = useState<string | null>(null);
  const [basedOnByMessageId, setBasedOnByMessageId] = useState<Record<string, string[]>>({});
  const [expandedReasoning, setExpandedReasoning] = useState<Set<string>>(new Set());

  const [briefing, setBriefing] = useState<Briefing | null>(null);

  // Message management (Phase 10): delete/clear/pin/convert-to-task/copy.
  // Delete uses the same click-twice-to-confirm inline pattern every other
  // delete affordance in this app uses (TaskCard, EditBookModal, etc.) —
  // "Clear chat" gets a real confirmation overlay instead since wiping the
  // whole conversation is a bigger, less-recoverable action than removing
  // one message.
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [taskAddedId, setTaskAddedId] = useState<string | null>(null);

  const { error: deleteError, run: runDeleteMessage } = useApiCall(deleteChatMessage);
  const { error: clearError, loading: clearing, run: runClearChat } = useApiCall(clearChatHistory);
  const { error: pinError, run: runTogglePin } = useApiCall(togglePinChatMessage);
  const { error: taskError, run: runAddTask } = useApiCall(addTask);

  useEffect(() => {
    if (!clearConfirmOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setClearConfirmOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clearConfirmOpen]);

  // Proactive opener: fetched once, only while there's no conversation yet
  // — a live conversation already has its own continuity; re-showing the
  // briefing on top of it would be exactly the "repeat what's already
  // known" this milestone was told to avoid.
  useEffect(() => {
    if (!open || chatHistory.length > 0 || briefing !== null) return;
    let cancelled = false;
    fetch("/api/briefing")
      .then((res) => (res.ok ? res.json() : { signals: [], conflicts: [] }))
      .then((data: Briefing) => {
        if (!cancelled) setBriefing(data);
      })
      .catch(() => {
        if (!cancelled) setBriefing({ signals: [], conflicts: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [open, chatHistory.length, briefing]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory, streamingReply, open]);

  async function streamReply(message: string, history: { role: string; content: string }[]) {
    setSending(true);
    setStreamingReply("");

    // Stall watchdog. The read loop below awaits the next chunk, and if the
    // provider accepts the connection and then goes quiet that await never
    // resolves *or* rejects — the spinner sits on "Life Plus חושב…" forever.
    // The timer is armed before the request and re-armed on every chunk, so
    // a slow-but-alive stream is never cut off; only a genuinely stalled one
    // is. Aborting the fetch makes reader.read() reject, which lands in the
    // catch below and produces an honest message instead of a hang.
    const controller = new AbortController();
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    const armStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => controller.abort(), STREAM_STALL_MS);
    };

    try {
      armStallTimer();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error("Chat request failed");

      const basedOn = decodeBasedOnHeader(res.headers.get("x-atlas-based-on"));

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        armStallTimer();
        fullText += decoder.decode(value, { stream: true });
        setStreamingReply(fullText);
      }

      const created = await addChatMessage({ role: "assistant", content: fullText || FRIENDLY_ERROR });
      if (basedOn.length > 0) {
        setBasedOnByMessageId((prev) => ({ ...prev, [created.id]: basedOn }));
      }
    } catch {
      await addChatMessage({ role: "assistant", content: FRIENDLY_ERROR });
    } finally {
      // Clearing the timer here matters as much as setting it: a timer left
      // armed after a successful reply would abort the *next* request.
      if (stallTimer) clearTimeout(stallTimer);
      setStreamingReply(null);
      setSending(false);
    }
  }

  function handleSend(overrideText?: string) {
    const message = (overrideText ?? input).trim();
    if (!message || sending) return;

    // Captured before addChatMessage updates the store, so this turn's own
    // message isn't double-counted — the API reconstructs the full turn as
    // [...history, { role: "user", content: message }] itself.
    const history = chatHistory.map((m) => ({ role: m.role, content: m.content }));
    addChatMessage({ role: "user", content: message });
    setInput("");
    streamReply(message, history);
  }

  function toggleReasoning(messageId: string) {
    setExpandedReasoning((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }

  function handleDeleteClick(messageId: string) {
    if (confirmingDeleteId !== messageId) {
      setConfirmingDeleteId(messageId);
      return;
    }
    setConfirmingDeleteId(null);
    runDeleteMessage(messageId).catch(() => {
      // error is already captured in deleteError for display below
    });
  }

  function handleClearConfirmed() {
    runClearChat()
      .then(() => setClearConfirmOpen(false))
      .catch(() => {
        // error is already captured in clearError for display below
      });
  }

  async function handleCopy(message: ChatMessage) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedId(message.id);
      setTimeout(() => setCopiedId((id) => (id === message.id ? null : id)), 1500);
    } catch {
      // clipboard permission denied/unavailable — the button just won't
      // show the success checkmark, nothing else to do about it here
    }
  }

  // "Extracts the core action" as a real, honest first pass: the message's
  // first sentence (capped so a task title never balloons to a full
  // paragraph), not an AI round-trip — this is a one-tap action meant to
  // feel instant, not a second "analyzing…" wait on top of the reply that
  // already streamed in. The full message is kept as the task's
  // description, so nothing is lost even when the title gets truncated.
  function extractTaskTitle(content: string): string {
    const firstLine = content.trim().split("\n")[0] ?? "";
    const sentenceEnd = firstLine.search(/[.!?](\s|$)/);
    const core = sentenceEnd > 0 ? firstLine.slice(0, sentenceEnd + 1) : firstLine;
    return core.length > 100 ? `${core.slice(0, 97)}…` : core;
  }

  function handleConvertToTask(message: ChatMessage) {
    runAddTask({ title: extractTaskTitle(message.content), description: message.content })
      .then(() => {
        setTaskAddedId(message.id);
        setTimeout(() => setTaskAddedId((id) => (id === message.id ? null : id)), 2000);
      })
      .catch(() => {
        // error is already captured in taskError for display below
      });
  }

  const showProactiveOpener = chatHistory.length === 0 && streamingReply === null;
  const pinnedMessages = chatHistory
    .filter((m) => m.pinnedAt)
    .sort((a, b) => (b.pinnedAt ?? "").localeCompare(a.pinnedAt ?? ""));

  return (
    <>
      {/* UI/UX Revamp: docked to the trailing (left) edge — the sidebar
          (components/layout/Sidebar.tsx) owns the right/leading edge now —
          as a floating glass panel with a margin from the screen edge
          (not flush), matching the glassmorphism "floating card" language
          used throughout the rest of the redesign rather than a native-
          feeling docked drawer. Sits above the mobile tab bar via the
          `bottom-20`/`sm:bottom-4` split. */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        backdrop={false}
        zIndex={Z_INDEX.panel}
        panelClassName="top-4 bottom-20 left-4 flex w-[calc(100%-2rem)] max-w-md flex-col sm:bottom-4 sm:w-[26rem]"
      >
        <div className="flex items-center justify-between border-b border-glass-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Logo size={22} />
            <span className="text-sm font-medium text-foreground">Life Plus Assistant</span>
          </div>
          <div className="flex items-center gap-1">
            {mode === "chat" && chatHistory.length > 0 && (
              <button
                onClick={() => setClearConfirmOpen(true)}
                className="focus-ring rounded-lg p-1.5 text-muted transition-colors hover:bg-fill-subtle hover:text-accent-family"
                aria-label="נקה היסטוריית שיחה"
              >
                <Eraser size={16} />
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="focus-ring rounded-lg p-1.5 text-muted transition-colors hover:bg-fill-subtle hover:text-foreground"
              aria-label="סגור"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* AI Command Panel (docs/ATLAS_ARCHITECTURE_VISION.md §12): a
            distinct, explicitly-chosen mode rather than silently guessing
            "is this message a command or a chat" from free text — the user
            decides, then the panel decides what to do with it. */}
        <div className="flex gap-1 border-b border-glass-border px-3 py-2">
          <button
            onClick={() => setMode("chat")}
            className={cn(
              "focus-ring rounded-lg px-2.5 py-1 text-xs transition-colors",
              mode === "chat"
                ? "glass-control glass-control-active text-foreground"
                : "glass-control-hover text-muted hover:text-foreground"
            )}
          >
            שיחה
          </button>
          <button
            onClick={() => setMode("command")}
            className={cn(
              "focus-ring rounded-lg px-2.5 py-1 text-xs transition-colors",
              mode === "command"
                ? "glass-control glass-control-active text-foreground"
                : "glass-control-hover text-muted hover:text-foreground"
            )}
          >
            פקודה
          </button>
        </div>

        {mode === "command" && <CommandPanel />}

        {mode === "chat" && (
        <>
        {/* Pinned messages sit outside the scrolling list entirely — always
            visible regardless of scroll position, matching "stick to the
            top" literally rather than just sorting them first inside the
            same scroll container. The message still also renders in its
            normal chronological spot below (same convention Telegram/Slack
            pins use), so nothing disappears from the conversation's flow. */}
        {pinnedMessages.length > 0 && (
          <div className="glass-glow border-b border-glass-border bg-accent-faith/5 px-4 py-2.5">
            <p className="mb-1.5 flex items-center gap-1 text-[10px] font-medium text-accent-faith">
              <Pin size={10} aria-hidden />
              נעוץ
            </p>
            <div className="flex flex-col gap-1.5">
              {pinnedMessages.map((m) => (
                <div
                  key={m.id}
                  className="flex items-start justify-between gap-2 rounded-lg bg-accent-faith/10 px-2.5 py-1.5 ring-1 ring-accent-faith/30"
                >
                  <p className="line-clamp-2 flex-1 text-xs leading-relaxed text-foreground/90">{m.content}</p>
                  <button
                    onClick={() => runTogglePin(m.id).catch(() => {})}
                    aria-label="בטל נעיצה"
                    className="focus-ring shrink-0 text-accent-faith/70 transition-colors hover:text-accent-faith"
                  >
                    <PinOff size={12} aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {showProactiveOpener && (
            <div className="flex flex-col gap-3">
              <p className="text-sm leading-relaxed text-muted">
                שלום, {displayName}. אני כאן כשתרצה לעצור לרגע ולהשתקף.
              </p>

              {briefing && briefing.signals.length > 0 && (
                <>
                  <BriefingSignalList signals={briefing.signals} />
                  <div className="flex flex-wrap gap-1.5">
                    {briefing.signals.slice(0, 3).map((signal) => {
                      const snippet =
                        signal.summary.length > 24 ? `${signal.summary.slice(0, 24)}…` : signal.summary;
                      return (
                        <button
                          key={signal.id}
                          onClick={() => setInput(`ספר לי עוד על: ${signal.summary}`)}
                          className="focus-ring rounded-full border border-glass-border px-2.5 py-1 text-xs text-muted transition-colors hover:border-transparent hover:bg-fill-subtle hover:text-foreground"
                        >
                          {snippet}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {(!briefing || briefing.signals.length === 0) && (
                <p className="text-sm leading-relaxed text-muted">במה תרצה להרהר היום?</p>
              )}
            </div>
          )}

          <AnimatePresence initial={false}>
            {chatHistory.map((m) => {
              const isUser = m.role === "user";
              const isPinned = Boolean(m.pinnedAt);
              const isConfirmingDelete = confirmingDeleteId === m.id;
              return (
                <motion.div
                  key={m.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="group"
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed",
                      isUser ? "mr-auto bg-accent-knowledge/15 text-foreground" : "ml-auto bg-fill-subtle text-foreground",
                      isPinned && "ring-1 ring-accent-faith/50"
                    )}
                  >
                    {m.content}
                  </div>

                  {/* Action row: subtle by default (low opacity, always
                      tappable — this is what covers touch devices, since
                      there's no hover state to reveal them there), a
                      little more visible on hover/focus-within for desktop.
                      Copy/convert-to-task/pin are assistant-only per spec;
                      delete applies to any message. */}
                  <div className={cn("mt-1 flex max-w-[85%] items-center gap-0.5", isUser ? "mr-auto" : "ml-auto")}>
                    {!isUser && (
                      <>
                        <button
                          onClick={() => handleCopy(m)}
                          aria-label="העתק הודעה"
                          className="focus-ring rounded-lg p-1 text-muted opacity-40 transition-all hover:opacity-100 hover:text-foreground group-hover:opacity-70"
                        >
                          {copiedId === m.id ? (
                            <Check size={12} className="text-accent-time" aria-hidden />
                          ) : (
                            <Copy size={12} aria-hidden />
                          )}
                        </button>
                        <button
                          onClick={() => handleConvertToTask(m)}
                          aria-label="הפוך למשימה"
                          className="focus-ring rounded-lg p-1 text-muted opacity-40 transition-all hover:opacity-100 hover:text-foreground group-hover:opacity-70"
                        >
                          {taskAddedId === m.id ? (
                            <Check size={12} className="text-accent-time" aria-hidden />
                          ) : (
                            <ListTodo size={12} aria-hidden />
                          )}
                        </button>
                        <button
                          onClick={() => runTogglePin(m.id).catch(() => {})}
                          aria-label={isPinned ? "בטל נעיצה" : "נעץ הודעה"}
                          className={cn(
                            "focus-ring rounded-lg p-1 transition-all hover:opacity-100 group-hover:opacity-70",
                            isPinned ? "text-accent-faith opacity-100" : "text-muted opacity-40 hover:text-foreground"
                          )}
                        >
                          {isPinned ? <PinOff size={12} aria-hidden /> : <Pin size={12} aria-hidden />}
                        </button>
                      </>
                    )}

                    {isConfirmingDelete ? (
                      <span className="flex items-center gap-1.5 text-[10px]">
                        <button
                          onClick={() => handleDeleteClick(m.id)}
                          className="focus-ring rounded-lg bg-accent-family/20 px-1.5 py-0.5 font-medium text-accent-family transition-opacity hover:opacity-80"
                        >
                          מחק
                        </button>
                        <button
                          onClick={() => setConfirmingDeleteId(null)}
                          className="focus-ring text-muted transition-colors hover:text-foreground"
                        >
                          ביטול
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => handleDeleteClick(m.id)}
                        aria-label="מחק הודעה"
                        className="focus-ring rounded-lg p-1 text-muted opacity-40 transition-all hover:opacity-100 hover:text-accent-family group-hover:opacity-70"
                      >
                        <Trash2 size={12} aria-hidden />
                      </button>
                    )}
                  </div>

                  {m.role === "assistant" && basedOnByMessageId[m.id] && (
                    <div className="mb-1 ml-auto max-w-[85%]">
                      <button
                        onClick={() => toggleReasoning(m.id)}
                        className="focus-ring flex items-center gap-1 rounded-lg px-1 text-xs text-muted transition-colors hover:text-foreground"
                      >
                        <Info size={11} aria-hidden />
                        מבוסס על
                      </button>
                      {expandedReasoning.has(m.id) && (
                        <ul className="mt-1 flex flex-col gap-0.5 rounded-lg bg-fill-subtle p-2 text-xs text-foreground/70">
                          {basedOnByMessageId[m.id].map((line, i) => (
                            <li key={i}>{line}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>

          {(deleteError || pinError || taskError) && (
            <p className="text-xs text-accent-family">{deleteError ?? pinError ?? taskError}</p>
          )}

          {streamingReply !== null && (
            <div className="ml-auto max-w-[85%] rounded-xl bg-fill-subtle px-3 py-2 text-sm leading-relaxed text-foreground">
              {streamingReply || "Life Plus חושב…"}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-glass-border p-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="שתף מחשבה…"
            aria-label="הודעה ל-Life Plus Assistant"
            className="focus-ring flex-1 rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted"
          />
          <button
            onClick={() => handleSend()}
            disabled={sending || !input.trim()}
            className="flex size-9 items-center justify-center rounded-lg bg-accent-faith/20 text-accent-faith transition-opacity disabled:opacity-40"
            aria-label="שלח"
          >
            <Send size={16} />
          </button>
        </div>
        </>
        )}

        {/* Clear-chat confirmation — a real overlay (not the click-twice
            inline pattern every other delete in this app uses) since
            wiping the whole conversation is a bigger, less-recoverable
            action. Implemented as an absolutely-positioned overlay within
            this same panel rather than a second nested <Modal> instance:
            Modal's own focus-trap effect keys off its own `open` state and
            registers a window keydown listener for the duration it's
            mounted — nesting a second live Modal while this one stays open
            would register two independent Tab-trapping listeners at once
            with no coordination between them. */}
        <AnimatePresence>
          {clearConfirmOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              role="alertdialog"
              aria-modal="true"
              aria-label="אישור ניקוי היסטוריית שיחה"
              className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 p-6 backdrop-blur-sm"
            >
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="glass-panel glass-glow w-full max-w-xs rounded-2xl p-5"
              >
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-family/15 text-accent-family">
                    <Trash2 size={18} aria-hidden />
                  </span>
                  <div>
                    <p className="font-medium text-foreground">לנקות את כל השיחה?</p>
                    <p className="mt-0.5 text-xs text-muted">הפעולה לא ניתנת לביטול.</p>
                  </div>
                </div>

                {clearError && <p className="mb-3 text-xs text-accent-family">{clearError}</p>}

                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => setClearConfirmOpen(false)}
                    disabled={clearing}
                    className="focus-ring rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:text-foreground disabled:opacity-40"
                  >
                    ביטול
                  </button>
                  <button
                    onClick={handleClearConfirmed}
                    disabled={clearing}
                    className="focus-ring rounded-lg bg-accent-family/20 px-4 py-2 text-sm font-medium text-accent-family transition-opacity hover:opacity-80 disabled:opacity-40"
                  >
                    {clearing ? "מנקה…" : "נקה הכל"}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </Modal>

      <motion.button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fixed bottom-20 left-4 flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-accent-faith/80 to-accent-knowledge/80 text-background shadow-xl sm:bottom-6 sm:left-8",
          Z_INDEX.panel
        )}
        animate={{ boxShadow: ["0 0 0 0 rgba(212,175,122,0.3)", "0 0 0 12px rgba(212,175,122,0)"] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.96 }}
        aria-label="פתח את Life Plus"
      >
        <Sparkles size={22} />
      </motion.button>
    </>
  );
}
