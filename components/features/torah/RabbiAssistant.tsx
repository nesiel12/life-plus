"use client";

import { useEffect, useRef, useState } from "react";
import { GraduationCap, Loader2, Send } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";

interface Turn {
  role: "user" | "assistant";
  content: string;
}

const STORAGE_KEY = "lifeplus.rabbi.thread.v1";

const OPENERS = [
  "מה מקור החיוב של תפילת ערבית, והאם היא רשות?",
  "הסבר לי את הסוגיה של 'תרי ותרי' בקצרה",
  "מהם עיקרי המחלוקת בין רש\"י לתוספות בפירוש 'מיגו'?",
  "מה דעת המשנה ברורה לגבי אמירת קריאת שמע על המיטה?",
];

// The AI Rabbi Assistant. A learned, source-citing guide to Halacha, Tanakh,
// Gemara and Jewish thought. It teaches and cites; a binding p'sak for a real
// situation still belongs with the questioner's own rav — the model is told
// that, and says it. The conversation is kept only in this browser.
export function RabbiAssistant() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setTurns(JSON.parse(raw) as Turn[]);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      if (turns.length) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(turns.slice(-40)));
    } catch {
      /* ignore */
    }
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, streaming]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    const next: Turn[] = [...turns, { role: "user", content: t }];
    setTurns(next);
    setInput("");
    setStreaming("");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/rabbi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      if (res.status === 503) {
        setError("העוזר דורש מפתח AI מחובר. פנה למנהל המערכת.");
        setStreaming(null);
        return;
      }
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => null);
        setError((d?.error as string) ?? "לא הצלחנו להתחבר.");
        setStreaming(null);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        setStreaming(full);
      }
      setTurns((prev) => [...prev, { role: "assistant", content: full || "נסה לנסח את השאלה שוב." }]);
    } catch {
      setError("אין חיבור לשרת.");
    } finally {
      setStreaming(null);
      setBusy(false);
    }
  }

  function clear() {
    setTurns([]);
    setError(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  return (
    <GlassCard className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <GraduationCap size={16} className="text-accent-faith" aria-hidden />
            העוזר הרבני
          </p>
          <p className="mt-0.5 text-xs text-muted">
            שאלות בהלכה, ביאור סוגיות ומחשבת ישראל — עם מראי מקומות מדויקים. לפסק הלכה למעשה יש לפנות
            לרב.
          </p>
        </div>
        {turns.length > 0 && (
          <button
            onClick={clear}
            className="focus-ring shrink-0 rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:text-foreground"
          >
            שיחה חדשה
          </button>
        )}
      </div>

      {turns.length === 0 && !streaming ? (
        <div className="flex flex-wrap gap-1.5">
          {OPENERS.map((o) => (
            <button
              key={o}
              onClick={() => send(o)}
              className="focus-ring rounded-lg border border-hairline-card px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
            >
              {o}
            </button>
          ))}
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="flex max-h-[28rem] flex-col gap-3 overflow-y-auto rounded-xl bg-fill-subtle p-3"
        >
          {turns.map((turn, i) => (
            <div
              key={i}
              className={cn(
                "max-w-[90%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm leading-relaxed",
                turn.role === "user"
                  ? "self-start bg-accent-faith/12 text-foreground"
                  : "self-end bg-surface text-foreground/90"
              )}
            >
              {turn.content}
            </div>
          ))}
          {streaming !== null && (
            <div className="max-w-[90%] self-end whitespace-pre-wrap rounded-xl bg-surface px-3 py-2 text-sm leading-relaxed text-foreground/90">
              {streaming || <Loader2 size={14} className="animate-spin text-muted" aria-hidden />}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-accent-family">{error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="שאל את העוזר הרבני…"
          aria-label="שאלה לעוזר הרבני"
          className="focus-ring flex-1 rounded-xl bg-fill-subtle px-3 py-2.5 text-sm text-foreground placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={!input.trim() || busy}
          className="focus-ring flex shrink-0 items-center gap-1.5 rounded-xl bg-accent-faith/20 px-4 py-2.5 text-sm font-medium text-accent-faith transition-opacity disabled:opacity-40"
        >
          {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Send size={14} aria-hidden />}
        </button>
      </form>
    </GlassCard>
  );
}
