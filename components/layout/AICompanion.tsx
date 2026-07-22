"use client";

import { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import { Sparkles, X, Send, Info } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { Logo } from "@/components/ui/Logo";
import { Modal, Z_INDEX } from "@/components/ui/Modal";
import { BriefingSignalList, type BriefingSignal } from "@/components/features/BriefingSignalList";
import { CommandPanel } from "@/components/features/CommandPanel";
import { cn } from "@/lib/utils";

interface Briefing {
  signals: BriefingSignal[];
  conflicts: string[];
}

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const displayName = session?.user?.name ?? user.hebrewName;

  const [sending, setSending] = useState(false);
  const [streamingReply, setStreamingReply] = useState<string | null>(null);
  const [basedOnByMessageId, setBasedOnByMessageId] = useState<Record<string, string[]>>({});
  const [expandedReasoning, setExpandedReasoning] = useState<Set<string>>(new Set());

  const [briefing, setBriefing] = useState<Briefing | null>(null);

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
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      if (!res.ok || !res.body) throw new Error("Chat request failed");

      const basedOnHeader = res.headers.get("x-atlas-based-on");
      const basedOn: string[] = basedOnHeader ? JSON.parse(basedOnHeader) : [];

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
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

  const showProactiveOpener = chatHistory.length === 0 && streamingReply === null;

  return (
    <>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        backdrop={false}
        zIndex={Z_INDEX.panel}
        panelClassName="bottom-24 right-6 h-[32rem] w-[24rem] flex flex-col sm:right-8"
      >
        <div className="flex items-center justify-between border-b border-glass-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Logo size={22} />
            <span className="text-sm font-medium text-foreground">מרחב ההשתקפות</span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="focus-ring rounded-lg p-1.5 text-muted transition-colors hover:bg-white/5 hover:text-foreground"
            aria-label="סגור"
          >
            <X size={18} />
          </button>
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
              mode === "chat" ? "bg-white/5 text-foreground" : "text-muted hover:text-foreground"
            )}
          >
            שיחה
          </button>
          <button
            onClick={() => setMode("command")}
            className={cn(
              "focus-ring rounded-lg px-2.5 py-1 text-xs transition-colors",
              mode === "command" ? "bg-white/5 text-foreground" : "text-muted hover:text-foreground"
            )}
          >
            פקודה
          </button>
        </div>

        {mode === "command" && <CommandPanel />}

        {mode === "chat" && (
        <>
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
                          className="focus-ring rounded-full border border-glass-border px-2.5 py-1 text-xs text-muted transition-colors hover:border-transparent hover:bg-white/5 hover:text-foreground"
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

          {chatHistory.map((m) => (
            <div key={m.id}>
              <div
                className={cn(
                  "max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed",
                  m.role === "user"
                    ? "mr-auto bg-accent-knowledge/15 text-foreground"
                    : "ml-auto bg-white/5 text-foreground"
                )}
              >
                {m.content}
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
                    <ul className="mt-1 flex flex-col gap-0.5 rounded-lg bg-white/5 p-2 text-xs text-foreground/70">
                      {basedOnByMessageId[m.id].map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ))}

          {streamingReply !== null && (
            <div className="ml-auto max-w-[85%] rounded-xl bg-white/5 px-3 py-2 text-sm leading-relaxed text-foreground">
              {streamingReply || "אטלס חושב…"}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-glass-border p-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="שתף מחשבה…"
            aria-label="הודעה לאטלס"
            className="focus-ring flex-1 rounded-lg bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted"
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
      </Modal>

      <motion.button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fixed bottom-6 right-6 flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-accent-faith/80 to-accent-knowledge/80 text-background shadow-xl sm:right-8",
          Z_INDEX.panel
        )}
        animate={{ boxShadow: ["0 0 0 0 rgba(212,175,122,0.3)", "0 0 0 12px rgba(212,175,122,0)"] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.96 }}
        aria-label="פתח את אטלס"
      >
        <Sparkles size={22} />
      </motion.button>
    </>
  );
}
