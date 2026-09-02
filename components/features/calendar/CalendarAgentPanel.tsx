"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, CalendarPlus, Check, Send, Sparkles } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { cn } from "@/lib/utils";
import type { FocusSlot } from "@/lib/calendar/findFocusSlots";

interface ProposedEvent {
  title: string;
  start: string;
  end: string;
  durationMinutes: number;
}

type AgentResponse =
  | { status: "unclear"; clarification: string }
  | { status: "proposed"; event: ProposedEvent; conflict: boolean; alternatives: FocusSlot[] };

interface CalendarAgentPanelProps {
  busy: { start: string; end: string; title?: string }[];
  /** Called after an event is really created, so the caller can refetch. */
  onCreated?: () => void;
}

function localNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("he-IL", { weekday: "long", day: "2-digit", month: "2-digit" });
}

function formatRange(start: string, end: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  return `${fmt(start)}–${fmt(end)}`;
}

// The CalendarAgent's surface. Interpretation and creation are two separate
// calls on purpose (see app/api/ai/calendar-agent): the agent proposes, the
// person confirms, and only then does anything reach Google Calendar. A
// conflict does not block confirming — it is surfaced with alternatives, and
// the user is allowed to double-book deliberately.
export function CalendarAgentPanel({ busy, onCreated }: CalendarAgentPanelProps) {
  const reduce = useReducedMotion();
  const chronotype = useAtlasStore((s) => s.personalDNA.chronotype);

  const [message, setMessage] = useState("");
  const [response, setResponse] = useState<AgentResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function interpret() {
    const trimmed = message.trim();
    if (!trimmed || pending) return;
    setPending(true);
    setError(null);
    setResponse(null);
    setCreated(false);
    try {
      const res = await fetch("/api/ai/calendar-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          nowLocal: localNow(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          busy,
          chronotype,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "לא הצלחנו לפרש את הבקשה.");
        return;
      }
      setResponse(data as AgentResponse);
    } catch {
      setError("לא הצלחנו להגיע לסוכן היומן.");
    } finally {
      setPending(false);
    }
  }

  async function confirm(start: string, end: string, title: string) {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, start, end }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "היומן דחה את האירוע.");
        return;
      }
      setCreated(true);
      setResponse(null);
      setMessage("");
      onCreated?.();
    } catch {
      setError("לא הצלחנו להגיע ליומן.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-gold-ink" aria-hidden />
        <p className="text-sm font-medium text-muted">הוסף אירוע בשפה חופשית</p>
      </div>

      <div className="flex gap-2">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && interpret()}
          placeholder="למשל: קבע פגישה מחר ב-3 אחה״צ"
          aria-label="תיאור האירוע בשפה חופשית"
          className="focus-ring flex-1 rounded-xl border border-hairline-card bg-surface-sunken px-3 py-2.5 text-sm text-foreground placeholder:text-muted"
        />
        <button
          onClick={interpret}
          disabled={!message.trim() || pending}
          className="focus-ring flex shrink-0 items-center gap-1.5 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-[var(--background)] transition-opacity disabled:opacity-40"
        >
          <Send size={14} className={cn(pending && "animate-pulse")} aria-hidden />
          {pending ? "מפענח…" : "פרש"}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-xs text-accent-family">
          {error}
        </p>
      )}

      {created && (
        <p className="flex items-center gap-1.5 text-xs text-accent-health">
          <Check size={12} aria-hidden />
          האירוע נוסף ליומן.
        </p>
      )}

      <AnimatePresence mode="wait">
        {response?.status === "unclear" && (
          <motion.p
            key="unclear"
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            className="rounded-xl border border-hairline-card bg-surface-sunken px-3 py-2.5 text-sm text-foreground"
          >
            {response.clarification}
          </motion.p>
        )}

        {response?.status === "proposed" && (
          <motion.div
            key="proposed"
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            className="flex flex-col gap-3 rounded-xl border border-hairline-card bg-surface-sunken p-4"
          >
            <div>
              <p className="text-sm font-medium text-foreground">{response.event.title}</p>
              <p className="mt-0.5 text-xs text-muted">
                {formatWhen(response.event.start)} ·{" "}
                <span className="ltr">{formatRange(response.event.start, response.event.end)}</span>
              </p>
            </div>

            {response.conflict && (
              <p className="flex items-start gap-1.5 text-xs text-accent-family">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden />
                יש חפיפה עם אירוע קיים ביומן.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => confirm(response.event.start, response.event.end, response.event.title)}
                disabled={creating}
                className="focus-ring flex items-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-xs font-medium text-[var(--background)] transition-opacity disabled:opacity-40"
              >
                <CalendarPlus size={13} aria-hidden />
                {creating ? "מוסיף…" : response.conflict ? "הוסף בכל זאת" : "אשר והוסף"}
              </button>
              <button
                onClick={() => setResponse(null)}
                className="focus-ring rounded-lg border border-hairline-card px-3 py-2 text-xs text-muted transition-colors hover:text-foreground"
              >
                ביטול
              </button>
            </div>

            {response.alternatives.length > 0 && (
              <div className="border-t border-hairline-card pt-3">
                <p className="mb-2 text-xs text-muted">חלונות פנויים חלופיים באותו יום:</p>
                <div className="flex flex-wrap gap-2">
                  {response.alternatives.map((slot) => (
                    <button
                      key={slot.start}
                      onClick={() => {
                        const end = new Date(
                          new Date(slot.start).getTime() + response.event.durationMinutes * 60_000
                        ).toISOString();
                        confirm(slot.start, end, response.event.title);
                      }}
                      disabled={creating}
                      className={cn(
                        "focus-ring ltr rounded-lg border px-2.5 py-1.5 text-xs transition-colors disabled:opacity-40",
                        slot.energy === "peak"
                          ? "border-gold-line bg-gold-soft text-gold-ink"
                          : "border-hairline-card text-muted hover:text-foreground"
                      )}
                    >
                      {formatRange(slot.start, slot.end)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
