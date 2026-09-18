"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Lightbulb, Loader2, Send, Sparkles, Swords } from "lucide-react";
import { CitationCard } from "@/components/features/torah/hub/CitationCard";
import { cn } from "@/lib/utils";
import {
  HAVRUTA_INSIGHT_LABELS,
  HAVRUTA_MOVE_LABELS,
  type HavrutaInsightKind,
  type HavrutaMove,
} from "@/lib/torah/havruta";
import type { HavrutaSession } from "@/components/features/torah/havruta/useHavruta";

const MOVE_TONES: Record<HavrutaMove, string> = {
  kushya: "bg-accent-family/12 text-accent-family",
  shita: "bg-accent-knowledge/12 text-accent-knowledge",
  chizuk: "bg-accent-health/12 text-accent-health",
  birur: "bg-gold-soft text-gold-ink",
  teirutz: "bg-accent-career/12 text-accent-career",
};

const INSIGHT_TONES: Record<HavrutaInsightKind, string> = {
  chiddush: "text-gold-ink",
  kushya: "text-accent-family",
  resolution: "text-accent-health",
};

interface HavrutaChatProps {
  session: HavrutaSession;
  pending: string | null;
  summarizing: boolean;
  error: string | null;
  onSend: (text: string) => Promise<boolean>;
  onSummarize: () => void;
  /** Caps the scroll area when embedded in a page section. */
  compact?: boolean;
}

/**
 * The Havruta conversation itself — messages, move badges, verified sources,
 * the composer, and the distilled insights.
 *
 * Every assistant turn shows what it was doing (קושיא / שיטה חולקת / חיזוק…),
 * so the learner can tell being challenged from being agreed with at a glance.
 */
export function HavrutaChat({ session, pending, summarizing, error, onSend, onSummarize, compact }: HavrutaChatProps) {
  const reduceMotion = useReducedMotion();
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLLIElement>(null);
  const { messages, thread, openers } = session;
  const assistantTurns = messages.filter((m) => m.role === "assistant").length;

  useEffect(() => {
    if (messages.length > 0 || pending) endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [messages.length, pending]);

  async function submit(text: string) {
    const trimmed = text.trim();
    if (trimmed.length < 2 || pending) return;
    setDraft("");
    const ok = await onSend(trimmed);
    if (!ok) setDraft(trimmed);
  }

  return (
    <div className="flex flex-col gap-4">
      {messages.length === 0 && !pending && (
        <div className="flex flex-col gap-3 rounded-xl bg-gold-soft/50 p-4">
          <p className="flex items-center gap-2 text-sm text-foreground/85">
            <Swords size={14} className="text-gold-ink" aria-hidden />
            {thread.mode === "clarify"
              ? "החברותא תשאל אותך שאלות ותבדוק את ההבנה שלך — עם רמזים, בלי לתת מיד את התשובה."
              : thread.mode === "contradiction"
                ? "נעיין יחד בשני הצדדים ונחפש את דרך היישוב — חילוק, מחלוקת, או טעות באחד הסיכומים."
                : "הצג רעיון או הבנה, והחברותא תקשה עליך, תביא שיטות חולקות ותבקש מקורות."}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {openers.map((opener) => (
              <button
                key={opener}
                type="button"
                onClick={() => void submit(opener)}
                className="focus-ring rounded-full border border-gold-line bg-surface px-3 py-1 text-xs text-foreground/80 transition-colors hover:text-foreground"
              >
                {opener}
              </button>
            ))}
          </div>
        </div>
      )}

      {(messages.length > 0 || pending) && (
        <ol
          className={cn("flex flex-col gap-5 overflow-y-auto pe-1", compact ? "max-h-[32rem]" : "max-h-[60vh]")}
          aria-live="polite"
          aria-label="הדיון"
        >
          {messages.map((message) =>
            message.role === "user" ? (
              <motion.li key={message.id} initial={reduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                <p className="ms-auto w-fit max-w-[85%] whitespace-pre-line rounded-2xl rounded-se-sm bg-foreground px-3.5 py-2 text-sm text-background">
                  {message.content}
                </p>
              </motion.li>
            ) : (
              <motion.li
                key={message.id}
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-[94%] rounded-2xl rounded-ss-sm border border-hairline-card bg-surface px-4 py-3"
              >
                {message.moves.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {message.moves.map((move) => (
                      <span key={move} className={cn("rounded-full px-2 py-0.5 text-[0.65rem] font-medium", MOVE_TONES[move])}>
                        {HAVRUTA_MOVE_LABELS[move]}
                      </span>
                    ))}
                  </div>
                )}
                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">{message.content}</p>
                {message.citations.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-2 border-t border-hairline-card pt-3">
                    {message.citations.map((citation, i) => (
                      <CitationCard key={`${citation.reference}-${i}`} citation={citation} />
                    ))}
                  </ul>
                )}
              </motion.li>
            )
          )}
          {pending && (
            <li className="flex flex-col gap-2.5" role="status">
              <p className="ms-auto w-fit max-w-[85%] whitespace-pre-line rounded-2xl rounded-se-sm bg-foreground px-3.5 py-2 text-sm text-background">
                {pending}
              </p>
              <p className="flex items-center gap-2 text-xs text-muted">
                <Loader2 size={13} className="animate-spin" aria-hidden />
                החברותא מעיינת ובודקת מקורות מול ספריא…
              </p>
            </li>
          )}
          <li ref={endRef} aria-hidden />
        </ol>
      )}

      {thread.insights.length > 0 && (
        <section className="rounded-xl border border-gold-line bg-gold-soft/40 p-4" aria-labelledby={`insights-${thread.id}`}>
          <h3 id={`insights-${thread.id}`} className="mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Lightbulb size={14} className="text-gold-ink" aria-hidden />
            מה יצא לנו מהדיון
          </h3>
          <ul className="flex flex-col gap-2">
            {thread.insights.map((insight, i) => (
              <li key={i} className="text-sm leading-relaxed text-foreground/85">
                <span className={cn("me-1.5 text-xs font-semibold", INSIGHT_TONES[insight.kind])}>
                  {HAVRUTA_INSIGHT_LABELS[insight.kind]}:
                </span>
                {insight.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && (
        <p className="text-xs text-accent-family" role="alert">
          {error}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(draft);
        }}
        className="flex items-end gap-2 rounded-2xl border border-hairline-card bg-surface p-1.5 ps-3.5 focus-within:border-gold-line"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit(draft);
            }
          }}
          rows={Math.min(5, Math.max(1, draft.split("\n").length))}
          placeholder={messages.length ? "השב לחברותא…" : "כתוב את ההבנה שלך או את הטענה שתרצה לבחון…"}
          aria-label="הודעה לחברותא"
          maxLength={1500}
          className="min-w-0 flex-1 resize-none bg-transparent py-2 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={draft.trim().length < 2 || Boolean(pending)}
          aria-label="שלח לחברותא"
          className="focus-ring grid size-9 shrink-0 place-items-center rounded-xl bg-gold text-white transition-opacity disabled:opacity-40"
        >
          {pending ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Send size={15} className="-scale-x-100" aria-hidden />}
        </button>
      </form>

      {assistantTurns > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[0.7rem] text-muted">החברותא אינה פוסקת הלכה למעשה. לשאלה מעשית — שאל רב.</p>
          <button
            type="button"
            onClick={onSummarize}
            disabled={summarizing || Boolean(pending)}
            className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-hairline-card bg-surface px-3 py-1.5 text-xs font-medium text-foreground/85 transition-colors hover:border-gold-line disabled:opacity-50"
          >
            {summarizing ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Sparkles size={13} aria-hidden />}
            {thread.insights.length ? "עדכן את התובנות" : "סכם תובנות לשבת"}
          </button>
        </div>
      )}
    </div>
  );
}
