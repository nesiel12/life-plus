"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import { Sparkles, X, Send } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { Logo } from "@/components/ui/Logo";
import { Modal, Z_INDEX } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";

export function AICompanion() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const user = useAtlasStore((s) => s.user);
  const chatHistory = useAtlasStore((s) => s.chatHistory);
  const addChatMessage = useAtlasStore((s) => s.addChatMessage);
  const scrollRef = useRef<HTMLDivElement>(null);
  const displayName = session?.user?.name ?? user.hebrewName;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory, open]);

  async function handleSend() {
    const message = input.trim();
    if (!message || loading) return;

    addChatMessage({ role: "user", content: message });
    setInput("");
    setLoading(true);

    try {
      const history = chatHistory.map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      const data = await res.json();
      addChatMessage({ role: "assistant", content: data.reply ?? "…" });
    } catch {
      addChatMessage({
        role: "assistant",
        content: "לא הצלחתי להתחבר כרגע. נסה שוב עוד רגע.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        backdrop={false}
        zIndex={Z_INDEX.panel}
        panelClassName="bottom-24 right-6 h-[28rem] w-[22rem] flex flex-col sm:right-8"
      >
        <div className="flex items-center justify-between border-b border-glass-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Logo size={22} />
            <span className="text-sm font-medium text-foreground">מרחב ההשתקפות</span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-muted transition-colors hover:text-foreground"
            aria-label="סגור"
          >
            <X size={18} />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {chatHistory.length === 0 && (
            <p className="text-sm leading-relaxed text-muted">
              שלום, {displayName}. אני כאן כשתרצה לעצור לרגע ולהשתקף. במה תרצה להרהר היום?
            </p>
          )}
          {chatHistory.map((m) => (
            <div
              key={m.id}
              className={cn(
                "max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed",
                m.role === "user"
                  ? "mr-auto bg-accent-knowledge/15 text-foreground"
                  : "ml-auto bg-white/5 text-foreground"
              )}
            >
              {m.content}
            </div>
          ))}
          {loading && <p className="text-xs text-muted">אטלס חושב…</p>}
        </div>

        <div className="flex items-center gap-2 border-t border-glass-border p-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="שתף מחשבה…"
            className="flex-1 rounded-lg bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="flex size-9 items-center justify-center rounded-lg bg-accent-faith/20 text-accent-faith transition-opacity disabled:opacity-40"
            aria-label="שלח"
          >
            <Send size={16} />
          </button>
        </div>
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
