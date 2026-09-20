"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Flame, Volume2, VolumeX } from "lucide-react";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { multiplierFor, progressToNextTier } from "@/lib/torah/combo";
import { cn } from "@/lib/utils";

interface ComboHudProps {
  streak: number;
  xp: number;
  round: number;
  total: number;
  muted: boolean;
  onToggleMute: () => void;
}

/**
 * The battle's heads-up display: the 🔥 streak (with its progress to the next
 * multiplier), the live multiplier, session XP, and round progress.
 */
export function ComboHud({ streak, xp, round, total, muted, onToggleMute }: ComboHudProps) {
  const reduceMotion = useReducedMotion();
  const multiplier = multiplierFor(streak);
  const hot = multiplier > 1;

  return (
    <div className="glass-panel sticky top-3 z-30 flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5">
      <div className="flex items-center gap-3">
        <ProgressRing
          value={progressToNextTier(streak)}
          size={46}
          stroke={4}
          color={hot ? "rgb(245 158 11)" : "var(--gold)"}
          label={`רצף ${streak}`}
        >
          <motion.span
            animate={hot && !reduceMotion ? { scale: [1, 1.14, 1] } : { scale: 1 }}
            transition={hot && !reduceMotion ? { duration: 0.9, repeat: Infinity } : undefined}
            className={cn("grid place-items-center", hot ? "text-orange-500" : "text-muted")}
          >
            <Flame size={20} className={hot ? "fill-orange-400/60" : undefined} aria-hidden />
          </motion.span>
        </ProgressRing>
        <div>
          <p className="flex items-baseline gap-1.5">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={streak}
                initial={reduceMotion ? false : { y: -10, opacity: 0, scale: 1.4 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={reduceMotion ? undefined : { y: 10, opacity: 0 }}
                className="ltr text-xl font-bold tabular-nums text-foreground"
              >
                {streak}
              </motion.span>
            </AnimatePresence>
            <span className="text-xs text-muted">רצף</span>
          </p>
          <AnimatePresence>
            {hot && (
              <motion.span
                initial={reduceMotion ? false : { opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                className="ltr inline-block rounded-full bg-gradient-to-l from-amber-400 to-orange-500 px-2 py-0.5 text-[0.65rem] font-bold text-white shadow-[0_0_14px_rgba(245,158,11,0.55)]"
              >
                ×{multiplier}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-end">
          <motion.p key={xp} initial={reduceMotion ? false : { scale: 1.25 }} animate={{ scale: 1 }} className="ltr text-lg font-bold tabular-nums text-gold-ink">
            {xp} XP
          </motion.p>
          <p className="ltr text-[0.65rem] tabular-nums text-muted">
            {Math.min(round, total)}/{total}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleMute}
          aria-label={muted ? "הפעל צלילים" : "השתק צלילים"}
          aria-pressed={!muted}
          className="focus-ring grid size-8 place-items-center rounded-lg text-muted transition-colors hover:text-foreground"
        >
          {muted ? <VolumeX size={16} aria-hidden /> : <Volume2 size={16} aria-hidden />}
        </button>
      </div>
    </div>
  );
}
