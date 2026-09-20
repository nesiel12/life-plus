"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Layers, RotateCcw } from "lucide-react";
import { reviewAnswer, type SrsAnswer } from "@/lib/torah/srs";
import { FlipCard } from "@/components/features/torah/practice/FlipCard";
import { nextReviewLabel, XP } from "@/lib/torah/practiceStats";
import type { FlashcardView } from "@/lib/torah/lessons/types";
import { cn } from "@/lib/utils";

export interface DeckSummary {
  reviewed: number;
  recalled: number;
  xp: number;
}

interface FlashcardDeckProps {
  cards: FlashcardView[];
  /** Small label above each card — the lesson it came from, say. */
  labelFor?: (card: FlashcardView) => string | undefined;
  onFinish?: (summary: DeckSummary) => void;
}

const ANSWERS: { answer: SrsAnswer; label: string; key: string; tone: string }[] = [
  { answer: "again", label: "שוב", key: "1", tone: "border-accent-family/30 text-accent-family hover:bg-accent-family/8" },
  { answer: "hard", label: "קשה", key: "2", tone: "border-accent-fitness/30 text-accent-fitness hover:bg-accent-fitness/8" },
  { answer: "good", label: "טוב", key: "3", tone: "border-accent-knowledge/30 text-accent-knowledge hover:bg-accent-knowledge/8" },
  { answer: "easy", label: "קל", key: "4", tone: "border-accent-health/30 text-accent-health hover:bg-accent-health/8" },
];

/**
 * A spaced-repetition session over a set of cards.
 *
 * Flip with Space or a tap, then grade with 1–4, the buttons, the arrow keys,
 * or a swipe (right = knew it, left = again). Each button shows
 * when the card will come back under that grade — computed by the same SM-2
 * function the server applies, so the preview is the schedule. A card marked
 * "שוב" returns at the end of this session instead of vanishing until
 * tomorrow, which is when forgetting is cheapest to fix.
 */
export function FlashcardDeck({ cards, labelFor, onFinish }: FlashcardDeckProps) {
  const reduceMotion = useReducedMotion();
  const [queue, setQueue] = useState<FlashcardView[]>(cards);
  const [flipped, setFlipped] = useState(false);
  const [grading, setGrading] = useState(false);
  const [summary, setSummary] = useState<DeckSummary>({ reviewed: 0, recalled: 0, xp: 0 });
  const [error, setError] = useState<string | null>(null);
  const shownAt = useRef(Date.now());
  const finished = useRef(false);
  const total = useRef(cards.length);

  useEffect(() => {
    setQueue(cards);
    total.current = cards.length;
    finished.current = false;
    setSummary({ reviewed: 0, recalled: 0, xp: 0 });
  }, [cards]);

  const card = queue[0];

  const previews = useMemo(() => {
    if (!card) return null;
    const now = new Date();
    const state = {
      easeFactor: card.easeFactor,
      intervalDays: card.intervalDays,
      repetitions: card.repetitions,
      lapses: card.lapses,
      dueAt: new Date(card.dueAt),
    };
    return Object.fromEntries(ANSWERS.map(({ answer }) => [answer, nextReviewLabel(now, reviewAnswer(state, answer, now).dueAt)]));
  }, [card]);

  const grade = useCallback(
    async (answer: SrsAnswer) => {
      if (!card || grading || !flipped) return;
      setGrading(true);
      setError(null);
      try {
        const response = await fetch(`/api/torah/flashcards/${card.id}/grade`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answer, durationMs: Date.now() - shownAt.current }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        const recalled = answer !== "again";
        setSummary((s) => ({
          reviewed: s.reviewed + 1,
          recalled: s.recalled + (recalled ? 1 : 0),
          xp: s.xp + (recalled ? XP.reviewRecalled : XP.reviewForgotten),
        }));
        setQueue((q) => {
          const [, ...rest] = q;
          return recalled ? rest : [...rest, data.card as FlashcardView];
        });
        setFlipped(false);
        shownAt.current = Date.now();
      } catch {
        setError("הדירוג לא נשמר. נסה שוב.");
      } finally {
        setGrading(false);
      }
    },
    [card, grading, flipped]
  );

  useEffect(() => {
    if (queue.length === 0 && total.current > 0 && !finished.current) {
      finished.current = true;
      onFinish?.(summary);
    }
  }, [queue.length, summary, onFinish]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        setFlipped((f) => !f);
      }
      // Arrows mirror the swipe: right = knew it, left = again.
      if (event.key === "ArrowRight") void grade("good");
      if (event.key === "ArrowLeft") void grade("again");
      const match = ANSWERS.find((a) => a.key === event.key);
      if (match) void grade(match.answer);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [grade]);

  if (cards.length === 0) return null;

  if (!card) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-hairline-card bg-surface p-6 text-center">
        <Layers size={22} className="text-gold-ink" aria-hidden />
        <p className="text-sm font-semibold text-foreground">סיימת את הסבב</p>
        <p className="text-xs text-muted">
          {summary.recalled} מתוך {summary.reviewed} נזכרו · <span className="ltr tabular-nums">+{summary.xp}</span> XP
        </p>
      </div>
    );
  }

  const done = total.current - queue.filter((q) => cards.some((c) => c.id === q.id)).length;
  const label = labelFor?.(card);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 text-xs text-muted">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-fill">
          <div
            className="h-full rounded-full bg-gold transition-[width]"
            style={{ width: `${Math.min(100, (Math.max(0, done) / Math.max(1, total.current)) * 100)}%` }}
          />
        </div>
        <span className="ltr tabular-nums">
          {Math.max(0, done)}/{total.current}
        </span>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${card.id}-${summary.reviewed}`}
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: -12 }}
          transition={{ duration: 0.22 }}
        >
          <FlipCard
            front={card.front}
            back={card.back}
            label={label}
            flipped={flipped}
            onFlip={() => setFlipped((f) => !f)}
            onSwipe={(verdict) => void grade(verdict === "known" ? "good" : "again")}
            disabled={grading}
          />
        </motion.div>
      </AnimatePresence>

      <div className={cn("grid grid-cols-4 gap-2 transition-opacity", flipped ? "opacity-100" : "pointer-events-none opacity-40")}>
        {ANSWERS.map(({ answer, label: text, key, tone }) => (
          <button
            key={answer}
            type="button"
            disabled={!flipped || grading}
            onClick={() => void grade(answer)}
            className={cn("focus-ring flex flex-col items-center gap-0.5 rounded-2xl border bg-surface px-2 py-2.5 transition-colors", tone)}
          >
            <span className="text-sm font-semibold">{text}</span>
            <span className="text-[0.65rem] opacity-80">{previews?.[answer]}</span>
            <span className="ltr hidden text-[0.55rem] text-muted sm:block">{key}</span>
          </button>
        ))}
      </div>
      {error && (
        <p className="flex items-center gap-1.5 text-xs text-accent-family">
          <RotateCcw size={12} aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}
