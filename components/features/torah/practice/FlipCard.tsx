"use client";

import { useState } from "react";
import { motion, useMotionValue, useReducedMotion, useTransform, type PanInfo } from "framer-motion";
import { Check, RotateCcw } from "lucide-react";

export type SwipeVerdict = "known" | "again";

interface FlipCardProps {
  front: string;
  back: string;
  label?: string;
  flipped: boolean;
  onFlip: () => void;
  /** Swiping is only live once the answer is showing. */
  onSwipe?: (verdict: SwipeVerdict) => void;
  disabled?: boolean;
}

/** How far (px) or how fast a drag must go to count as a swipe. */
const SWIPE_DISTANCE = 110;
const SWIPE_VELOCITY = 600;

/**
 * A flashcard with a real 3D flip and swipe-to-grade.
 *
 * Tap (or Space) flips it. Once flipped, drag it right for "ידעתי" or left for
 * "שוב" — the card tilts with the drag and a badge fades in on the side it is
 * heading to, so the gesture's meaning is visible before it is committed.
 * Directions are physical (right = yes) in both RTL and LTR, as in every
 * swipe-to-decide interface; the badges make them unambiguous.
 */
export function FlipCard({ front, back, label, flipped, onFlip, onSwipe, disabled }: FlipCardProps) {
  const reduceMotion = useReducedMotion();
  const x = useMotionValue(0);
  const tilt = useTransform(x, [-200, 200], [-9, 9]);
  const knownOpacity = useTransform(x, [30, 110], [0, 1]);
  const againOpacity = useTransform(x, [-110, -30], [1, 0]);
  const [dragging, setDragging] = useState(false);
  const swipeable = flipped && Boolean(onSwipe) && !disabled;

  function onDragEnd(_: unknown, info: PanInfo) {
    setDragging(false);
    if (!onSwipe) return;
    if (info.offset.x > SWIPE_DISTANCE || info.velocity.x > SWIPE_VELOCITY) onSwipe("known");
    else if (info.offset.x < -SWIPE_DISTANCE || info.velocity.x < -SWIPE_VELOCITY) onSwipe("again");
  }

  return (
    <motion.div
      className="relative [perspective:1400px]"
      style={{ x, rotate: reduceMotion ? 0 : tilt }}
      drag={swipeable ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.85}
      onDragStart={() => setDragging(true)}
      onDragEnd={onDragEnd}
      whileDrag={{ cursor: "grabbing" }}
    >
      {swipeable && (
        <>
          <motion.span
            aria-hidden
            style={{ opacity: knownOpacity }}
            className="pointer-events-none absolute end-4 top-4 z-10 flex items-center gap-1 rounded-full bg-accent-health px-3 py-1 text-xs font-semibold text-white shadow-lg"
          >
            <Check size={13} />
            ידעתי
          </motion.span>
          <motion.span
            aria-hidden
            style={{ opacity: againOpacity }}
            className="pointer-events-none absolute start-4 top-4 z-10 flex items-center gap-1 rounded-full bg-accent-family px-3 py-1 text-xs font-semibold text-white shadow-lg"
          >
            <RotateCcw size={13} />
            שוב
          </motion.span>
        </>
      )}

      <motion.button
        type="button"
        onTap={() => {
          if (!dragging && !disabled) onFlip();
        }}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={reduceMotion ? { duration: 0 } : { type: "spring", visualDuration: 0.5, bounce: 0.15 }}
        style={{ transformStyle: "preserve-3d" }}
        aria-label={flipped ? `התשובה: ${back}. לחיצה חוזרת לשאלה` : `השאלה: ${front}. לחיצה מציגה את התשובה`}
        className="focus-ring relative block min-h-60 w-full touch-pan-y rounded-3xl text-center"
      >
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-3xl border border-hairline-card bg-surface p-7 shadow-[0_28px_60px_-34px_rgba(16,16,20,0.55)] [backface-visibility:hidden]">
          {label && <span className="text-[0.65rem] text-muted">{label}</span>}
          <span className="text-xl font-semibold leading-relaxed text-foreground">{front}</span>
          <span className="mt-2 text-[0.7rem] text-muted">לחיצה או רווח — להצגת התשובה</span>
        </span>
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-3xl border border-gold-line bg-gold-soft/80 p-7 shadow-[0_28px_60px_-34px_rgba(135,102,40,0.6)] [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <span className="text-xs text-gold-ink">{front}</span>
          <span className="text-lg leading-relaxed text-foreground">{back}</span>
          {onSwipe && <span className="mt-2 text-[0.7rem] text-muted">גרור ימינה — ידעתי · שמאלה — שוב</span>}
        </span>
      </motion.button>
    </motion.div>
  );
}
