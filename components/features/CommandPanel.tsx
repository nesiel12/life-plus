"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Zap, Check, X, Mic } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { recordRecommendationOutcomeAction } from "@/app/actions/recommendations";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import type { MomentCategory, LifeAreaKey } from "@/types";

type CommandPeriod = "morning" | "afternoon" | "evening" | "night";
type CommandDay = "today" | "tomorrow";

interface CalendarEventProposal {
  googleEventId: string;
  title: string;
  start: string;
  end: string;
}

interface CommandProposal {
  type: "add_moment" | "add_goal" | "log_family_interaction" | "clear_calendar_range";
  recommendationEventId: string;
  addMoment?: { category: MomentCategory; title: string; content: string };
  addGoal?: { title: string; category: LifeAreaKey };
  logFamilyInteraction?: { personId: string; personName: string; note?: string };
  clearCalendarRange?: { period: CommandPeriod; day: CommandDay; events: CalendarEventProposal[] };
}

interface CommandTurn {
  id: string;
  commandText: string;
  reply: string;
  proposal: CommandProposal | null;
  resolved: "pending" | "accepted" | "rejected";
  executing: boolean;
  error?: string;
}

const FRIENDLY_ERROR = "לא הצלחתי להתחבר כרגע. נסה שוב עוד רגע.";

// The AI Command Panel (docs/ATLAS_ARCHITECTURE_VISION.md §12): free-text
// Hebrew commands that turn into a real, confirmable proposal — never an
// action taken silently. app/api/commands/interpret does the interpreting;
// this component only renders the proposal and executes it, via the exact
// same store actions/routes every other part of this app already uses for
// the same mutation (addMoment, addGoal, logPersonInteraction, and — for
// calendar clearing specifically, since it needs the user's Google token —
// the DELETE handler on app/api/calendar/events).
export function CommandPanel() {
  const addMoment = useAtlasStore((s) => s.addMoment);
  const addGoal = useAtlasStore((s) => s.addGoal);
  const logPersonInteraction = useAtlasStore((s) => s.logPersonInteraction);

  const [turns, setTurns] = useState<CommandTurn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const voice = useVoiceInput((transcript) => setInput((prev) => (prev ? `${prev} ${transcript}` : transcript)));

  async function handleSend() {
    const commandText = input.trim();
    if (!commandText || sending) return;
    setInput("");
    setSending(true);

    const turnId = crypto.randomUUID();
    try {
      const res = await fetch("/api/commands/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: commandText }),
      });
      if (!res.ok) throw new Error("Command request failed");
      const data: { reply: string; proposal: CommandProposal | null } = await res.json();

      setTurns((prev) => [
        ...prev,
        {
          id: turnId,
          commandText,
          reply: data.reply,
          proposal: data.proposal,
          resolved: data.proposal ? "pending" : "accepted",
          executing: false,
        },
      ]);
    } catch {
      setTurns((prev) => [
        ...prev,
        { id: turnId, commandText, reply: FRIENDLY_ERROR, proposal: null, resolved: "accepted", executing: false },
      ]);
    } finally {
      setSending(false);
    }
  }

  function updateTurn(id: string, patch: Partial<CommandTurn>) {
    setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  async function handleConfirm(turn: CommandTurn) {
    const proposal = turn.proposal;
    if (!proposal) return;
    updateTurn(turn.id, { executing: true, error: undefined });

    try {
      if (proposal.type === "add_moment" && proposal.addMoment) {
        await addMoment(proposal.addMoment);
      } else if (proposal.type === "add_goal" && proposal.addGoal) {
        await addGoal(proposal.addGoal.title, proposal.addGoal.category, []);
      } else if (proposal.type === "log_family_interaction" && proposal.logFamilyInteraction) {
        const { personId, personName, note } = proposal.logFamilyInteraction;
        await logPersonInteraction(personId, note);
        await addMoment({
          category: "family",
          title: `רגע עם ${personName}`,
          content: note || `תיעוד רגע משמעותי עם ${personName}.`,
          personId,
        });
      } else if (proposal.type === "clear_calendar_range" && proposal.clearCalendarRange) {
        for (const event of proposal.clearCalendarRange.events) {
          await fetch("/api/calendar/events", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ googleEventId: event.googleEventId }),
          });
        }
      }

      updateTurn(turn.id, { resolved: "accepted", executing: false });
      recordRecommendationOutcomeAction(proposal.recommendationEventId, "accepted").catch((err) => {
        console.error("Failed to record recommendation outcome:", err);
      });
    } catch {
      updateTurn(turn.id, {
        executing: false,
        error: "משהו השתבש בביצוע — נסה שוב.",
      });
    }
  }

  function handleDismiss(turn: CommandTurn) {
    if (!turn.proposal) return;
    updateTurn(turn.id, { resolved: "rejected" });
    recordRecommendationOutcomeAction(turn.proposal.recommendationEventId, "rejected").catch((err) => {
      console.error("Failed to record recommendation outcome:", err);
    });
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <p className="text-sm leading-relaxed text-muted">
          תן/י פקודה בעברית חופשית — למשל &quot;נקה לי את הערב בשביל חברים&quot;, &quot;תרשום שסיימתי
          X&quot;, או &quot;רשום שדיברתי עם אמא&quot;. Life Plus יציע פעולה, ותאשר/י לפני שהיא מתבצעת.
        </p>

        {turns.map((turn) => (
          <div key={turn.id} className="flex flex-col gap-2">
            <p className="mr-auto max-w-[85%] rounded-xl bg-accent-knowledge/15 px-3 py-2 text-sm text-foreground">
              {turn.commandText}
            </p>
            <div className="ml-auto max-w-[90%] rounded-xl bg-white/5 px-3 py-2 text-sm leading-relaxed text-foreground">
              {turn.reply}

              {turn.proposal?.type === "clear_calendar_range" && turn.proposal.clearCalendarRange && (
                <ul className="mt-2 flex flex-col gap-1 text-xs text-foreground/70">
                  {turn.proposal.clearCalendarRange.events.map((event) => (
                    <li key={event.googleEventId}>
                      {event.title} · <span className="ltr">{event.start.slice(11, 16)}</span>
                    </li>
                  ))}
                </ul>
              )}

              {turn.error && <p className="mt-2 text-xs text-accent-family">{turn.error}</p>}

              {turn.proposal && turn.resolved === "pending" && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="mt-2 flex items-center gap-2"
                >
                  <button
                    onClick={() => handleConfirm(turn)}
                    disabled={turn.executing}
                    className="focus-ring flex items-center gap-1 rounded-lg bg-accent-health/15 px-3 py-1.5 text-xs font-medium text-accent-health transition-opacity disabled:opacity-50"
                  >
                    <Check size={12} aria-hidden />
                    {turn.executing ? "מבצע…" : "אשר"}
                  </button>
                  <button
                    onClick={() => handleDismiss(turn)}
                    disabled={turn.executing}
                    className="focus-ring flex items-center gap-1 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-muted transition-opacity hover:text-foreground disabled:opacity-50"
                  >
                    <X size={12} aria-hidden />
                    בטל
                  </button>
                </motion.div>
              )}

              {turn.resolved === "accepted" && turn.proposal && (
                <p className="mt-2 text-xs text-accent-health">בוצע.</p>
              )}
              {turn.resolved === "rejected" && <p className="mt-2 text-xs text-muted">בוטל.</p>}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 border-t border-glass-border p-3">
        {voice.supported && (
          <button
            onClick={voice.listening ? voice.stop : voice.start}
            aria-label={voice.listening ? "עצור הקלטה קולית" : "התחל הקלטה קולית"}
            className={`focus-ring flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
              voice.listening ? "bg-accent-family/20 text-accent-family" : "bg-white/5 text-muted hover:text-foreground"
            }`}
          >
            <Mic size={16} />
          </button>
        )}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="פקודה חופשית…"
          aria-label="פקודה ל-Life Plus"
          className="focus-ring flex-1 rounded-lg bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted"
        />
        <button
          onClick={handleSend}
          disabled={sending || !input.trim()}
          className="flex size-9 items-center justify-center rounded-lg bg-accent-faith/20 text-accent-faith transition-opacity disabled:opacity-40"
          aria-label="שלח פקודה"
        >
          <Zap size={16} />
        </button>
      </div>
    </div>
  );
}
