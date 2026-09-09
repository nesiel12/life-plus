"use client";

import { useMemo, useRef, useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { cn } from "@/lib/utils";

interface Turn {
  role: "user" | "assistant";
  content: string;
}

const STARTERS = [
  "כמה כדאי שיהיה לי בקרן חירום?",
  "איך בונים תקציב חודשי?",
  "משכנתא או שכירות — איך משווים?",
  "איך מתחילים לחסוך כשאין עודף בסוף החודש?",
];

// A free-form financial consultation — no accounts, no imported data needed.
// The CFO panel above analyses real transactions; this answers questions.
export function FinanceAssistant() {
  const transactions = useAtlasStore((s) => s.transactions);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // One optional line of context from data the page already has — never sent
  // if there are no transactions.
  const financialContext = useMemo(() => {
    const monthKey = new Date().toISOString().slice(0, 7);
    let income = 0;
    let expenses = 0;
    for (const tx of transactions) {
      if (tx.date.slice(0, 7) !== monthKey) continue;
      if (tx.type === "income") income += tx.amount;
      else expenses += tx.amount;
    }
    if (income === 0 && expenses === 0) return undefined;
    return `החודש: הכנסות כ-${Math.round(income)} ₪, הוצאות כ-${Math.round(expenses)} ₪.`;
  }, [transactions]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const next: Turn[] = [...turns, { role: "user", content: q }];
    setTurns(next);
    setInput("");
    setStreaming("");
    setBusy(true);
    setError(null);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }));

    try {
      const res = await fetch("/api/ai/finance-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, financialContext }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        setError((data?.error as string) ?? "לא הצלחנו להגיע ליועץ.");
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
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      }
      setTurns((prev) => [...prev, { role: "assistant", content: full || "לא הצלחתי לענות. נסה לנסח שוב." }]);
    } catch {
      setError("אין חיבור לשרת.");
    } finally {
      setStreaming(null);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-sm font-medium text-muted">
        <Sparkles size={16} className="text-accent-finance" aria-hidden />
        יועץ פיננסי
      </p>

      {turns.length === 0 && !streaming ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted">
            שאל כל שאלה על כסף — תקציב, חיסכון, חובות, קרן חירום. לא צריך לחבר חשבונות.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {STARTERS.map((s) => (
              <button
                key={s}
                onClick={() => ask(s)}
                className="focus-ring rounded-lg border border-hairline-card px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="flex max-h-80 flex-col gap-3 overflow-y-auto rounded-xl bg-surface-sunken/50 p-3"
        >
          {turns.map((turn, i) => (
            <div
              key={i}
              className={cn(
                "max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed",
                turn.role === "user"
                  ? "self-start bg-accent-finance/15 text-foreground"
                  : "self-end whitespace-pre-wrap bg-surface text-foreground/90"
              )}
            >
              {turn.content}
            </div>
          ))}
          {streaming !== null && (
            <div className="max-w-[85%] self-end whitespace-pre-wrap rounded-xl bg-surface px-3 py-2 text-sm leading-relaxed text-foreground/90">
              {streaming || <Loader2 size={14} className="animate-spin text-muted" aria-hidden />}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-accent-family">{error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="שאל את היועץ…"
          aria-label="שאלה ליועץ הפיננסי"
          className="focus-ring flex-1 rounded-xl border border-hairline-card bg-surface-sunken px-3 py-2.5 text-sm text-foreground placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={!input.trim() || busy}
          className="focus-ring flex shrink-0 items-center gap-1.5 rounded-xl bg-accent-finance/20 px-4 py-2.5 text-sm font-medium text-accent-finance transition-opacity disabled:opacity-40"
        >
          {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Send size={14} aria-hidden />}
        </button>
      </form>
    </div>
  );
}
