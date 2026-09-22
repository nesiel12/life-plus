"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { RotateCw } from "lucide-react";
import { useLabReducedMotion } from "@/components/features/learning/lab/useLabMotion";
import { MASTERY_LABELS } from "@/lib/torah/srs";
import type { SrsAnswer } from "@/lib/torah/srs";
import type { LearningFlashcard } from "@/lib/learning/flashcards";
import { cn } from "@/lib/utils";

interface Flashcard3DProps {
  card: LearningFlashcard;
  /**
   * The three confidence buttons the brief asks for (קל/בינוני/קשה) mapped onto
   * SM-2's four grades: קשה -> "again" (did not really know it, resets the
   * schedule), בינוני -> "good" (a normal, successful recall — deliberately
   * the middle button, since that is the answer a healthy deck gets most
   * often), קל -> "easy" (grows the interval faster). SM-2's own "hard" grade
   * has no button here — it is a fine distinction a 3-button confidence rating
   * does not need to expose.
   */
  onAnswer: (answer: SrsAnswer) => void;
  grading: boolean;
}

const CONFIDENCE: { answer: SrsAnswer; label: string; tone: string }[] = [
  { answer: "again", label: "קשה", tone: "bg-accent-family/15 text-accent-family" },
  { answer: "good", label: "בינוני", tone: "bg-accent-fitness/15 text-accent-fitness" },
  { answer: "easy", label: "קל", tone: "bg-accent-health/15 text-accent-health" },
];

/**
 * An Anki-style flashcard: tap to flip on a real 3D Y-rotation
 * (`transform: rotateY`, GPU-accelerated), then rate how well you knew it.
 * The card is `backface-visibility: hidden` on both faces so the flip never
 * shows mirrored text mid-turn.
 */
export function Flashcard3D({ card, onAnswer, grading }: Flashcard3DProps) {
  const reduce = useLabReducedMotion();
  const [flipped, setFlipped] = useState(false);

  function pick(answer: SrsAnswer) {
    onAnswer(answer);
    setFlipped(false);
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-full max-w-sm" style={{ perspective: 1400 }}>
        <motion.button
          type="button"
          onClick={() => setFlipped((v) => !v)}
          aria-label={flipped ? "הצג את צד השאלה" : "הצג את צד התשובה"}
          className="focus-ring relative block h-56 w-full"
          style={{ transformStyle: "preserve-3d" }}
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: reduce ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <Face side="front" active={!flipped}>
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted">שאלה</span>
            <p className="text-lg font-semibold leading-snug text-foreground">{card.front}</p>
            <span className="mt-2 flex items-center gap-1 text-xs text-muted">
              <RotateCw size={11} aria-hidden />
              הקש כדי לראות את התשובה
            </span>
          </Face>
          <Face side="back" active={flipped}>
            <span className="text-[10px] font-medium uppercase tracking-wide text-accent-learning">תשובה</span>
            <p className="text-lg font-semibold leading-snug text-foreground">{card.back}</p>
          </Face>
        </motion.button>
      </div>

      {flipped ? (
        <div className="flex items-center gap-2">
          {CONFIDENCE.map((c) => (
            <button
              key={c.answer}
              onClick={() => pick(c.answer)}
              disabled={grading}
              className={cn("focus-ring rounded-xl px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-50", c.tone)}
            >
              {c.label}
            </button>
          ))}
        </div>
      ) : (
        <span className="rounded-full bg-fill-subtle px-2.5 py-1 text-[11px] text-muted">{MASTERY_LABELS[card.tier]}</span>
      )}
    </div>
  );
}

function Face({ side, active, children }: { side: "front" | "back"; active: boolean; children: React.ReactNode }) {
  return (
    <span
      aria-hidden={!active}
      className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-3xl border border-hairline-card bg-surface p-6 text-center shadow-[0_18px_44px_-28px_rgba(16,16,20,0.3)]"
      style={{ backfaceVisibility: "hidden", transform: side === "back" ? "rotateY(180deg)" : undefined }}
    >
      {children}
    </span>
  );
}
