"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Mic, Send } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { deleteWater, postFab, postWater } from "@/lib/ai/fabClient";
import { runQuickLog, type ProposalTurn, type QuickLogActions, type UndoableLog } from "@/lib/ai/quickLog";
import { cn } from "@/lib/utils";

interface QuickLogPanelProps {
  /** A distress message, or the "קשה לי עכשיו" chip. Nothing has been sent anywhere. */
  onSos: () => void;
  /** An auto-mode write that has already happened; the caller shows the undo toast. */
  onLogged: (log: UndoableLog) => void;
  /** A ready-made proposal for the Command Panel to render and confirm. */
  onProposal: (turn: ProposalTurn) => void;
  /** Not a quick log — the Command Panel interprets it. */
  onHandoff: (text: string) => void;
}

const EXAMPLES = ["שתיתי כוס מים", "שילמתי 20 על קפה", "תזכיר לי להתקשר לרופא מחר בתשע"];
const MAX_RECENT = 3;

// The Companion's quick-log tab: one line in — typed or spoken — and the FAB
// router (lib/ai/fabRouter.ts) decides whether it is a water/expense/task log
// to perform at once, a proposal to confirm, or something for the command
// pipeline. All the deciding lives in lib/ai/quickLog.ts; this only renders.
export function QuickLogPanel({ onSos, onLogged, onProposal, onHandoff }: QuickLogPanelProps) {
  const addTask = useAtlasStore((s) => s.addTask);
  const deleteTask = useAtlasStore((s) => s.deleteTask);
  const addTransaction = useAtlasStore((s) => s.addTransaction);
  const deleteTransaction = useAtlasStore((s) => s.deleteTransaction);

  const [input, setInput] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [recent, setRecent] = useState<{ id: number; summary: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextRecentId = useRef(0);
  const workingRef = useRef(false);

  const actions = useMemo<QuickLogActions>(
    () => ({
      addTask: (input) => addTask(input),
      deleteTask,
      addTransaction: (input) => addTransaction(input),
      deleteTransaction,
      logWater: postWater,
      deleteWater,
    }),
    [addTask, deleteTask, addTransaction, deleteTransaction]
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function submit(text: string) {
    // A ref, not the state: a spoken phrase can arrive in the same tick as a
    // click, before `working` has re-rendered.
    if (workingRef.current || !text.trim()) return;
    workingRef.current = true;
    setWorking(true);
    setMessage(null);

    try {
      const outcome = await runQuickLog(text, { route: postFab, actions });

      switch (outcome.kind) {
        case "sos":
          setInput("");
          onSos();
          break;
        case "logged":
          setInput("");
          setRecent((prev) =>
            [{ id: nextRecentId.current++, summary: outcome.summary }, ...prev].slice(0, MAX_RECENT)
          );
          onLogged({ summary: outcome.summary, undo: outcome.undo });
          break;
        case "proposal":
          setInput("");
          onProposal(outcome);
          break;
        case "handoff":
          setInput("");
          onHandoff(outcome.text);
          break;
        case "reply":
          setMessage(outcome.reply);
          break;
        case "error":
          // The input is kept: a failed request should never cost the words.
          setMessage(outcome.message);
          break;
      }
    } finally {
      workingRef.current = false;
      setWorking(false);
    }
  }

  // useVoiceInput captures its callback once, at mount, so a transcript must
  // reach the *current* submit through a ref or it would run against the first
  // render's stale closure. A finished phrase is submitted at once: tapping the
  // mic is the deliberate act, and every auto write it can cause has an undo.
  const submitRef = useRef(submit);
  submitRef.current = submit;
  const voice = useVoiceInput((transcript) => {
    setInput(transcript);
    void submitRef.current(transcript);
  });

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <p className="text-sm leading-relaxed text-muted">
          כתוב או אמור שורה אחת — מים, הוצאה, משימה, חידוש תורה או שיחה עם מישהו. רישומים קטנים נשמרים
          מיד ואפשר לבטל; כל דבר אחר מוצע לאישור.
        </p>

        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              onClick={() => {
                setInput(example);
                inputRef.current?.focus();
              }}
              className="focus-ring rounded-full border border-glass-border px-2.5 py-1 text-xs text-muted transition-colors hover:border-transparent hover:bg-fill-subtle hover:text-foreground"
            >
              {example}
            </button>
          ))}
          {/* The literal "קשה לי עכשיו" entry point. Straight to SOS — it is a
              button, not text, so there is nothing to classify or send. */}
          <button
            onClick={onSos}
            className="focus-ring rounded-full border border-glass-border px-2.5 py-1 text-xs text-muted transition-colors hover:border-transparent hover:bg-fill-subtle hover:text-foreground"
          >
            קשה לי עכשיו
          </button>
        </div>

        {message && (
          <p role="status" className="rounded-lg bg-fill-subtle px-3 py-2 text-sm leading-relaxed text-foreground">
            {message}
          </p>
        )}

        {recent.length > 0 && (
          <ul className="flex flex-col gap-1.5" aria-label="רישומים אחרונים">
            {recent.map((entry) => (
              <li key={entry.id} className="flex items-center gap-2 text-xs text-foreground/70">
                <Check size={12} className="shrink-0 text-accent-health" aria-hidden />
                <span className="truncate">{entry.summary}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-glass-border p-3">
        {voice.supported && (
          <button
            onClick={voice.listening ? voice.stop : voice.start}
            aria-label={voice.listening ? "עצור הקלטה קולית" : "התחל הקלטה קולית"}
            className={cn(
              "focus-ring flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors",
              voice.listening ? "bg-accent-family/20 text-accent-family" : "bg-fill-subtle text-muted hover:text-foreground"
            )}
          >
            <Mic size={16} />
          </button>
        )}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void submit(input)}
          placeholder="שתיתי כוס מים…"
          aria-label="רישום מהיר"
          className="focus-ring flex-1 rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted"
        />
        <button
          onClick={() => void submit(input)}
          disabled={working || !input.trim()}
          className="flex size-9 items-center justify-center rounded-lg bg-accent-faith/20 text-accent-faith transition-opacity disabled:opacity-40"
          aria-label="רשום"
        >
          {working ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
    </div>
  );
}
