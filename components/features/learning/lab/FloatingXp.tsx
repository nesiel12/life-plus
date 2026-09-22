"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Portal } from "@/components/features/learning/lab/Portal";
import { useLabReducedMotion } from "@/components/features/learning/lab/useLabMotion";

export interface XpPop {
  id: number;
  amount: number;
  /** Viewport coordinates the "+N XP" rises from. */
  x: number;
  y: number;
  /** A word to show beside it — "רמה 3!" for a level-up. */
  label?: string;
}

/**
 * "+50 XP", floating up from where the thing was ticked and fading out.
 *
 * Purely visual: it announces nothing to a screen reader (the change itself is
 * already announced where it happens), and it never blocks a click.
 */
export function XpPops({ pops }: { pops: readonly XpPop[] }) {
  const reduce = useLabReducedMotion();

  return (
    <Portal>
      <div aria-hidden className="pointer-events-none fixed inset-0 z-[150]">
        <AnimatePresence>
          {pops.map((pop) => (
            <motion.div
              key={pop.id}
              className="absolute flex items-baseline gap-1.5 whitespace-nowrap text-lg font-bold text-gold-ink"
              style={{ left: pop.x, top: pop.y, translateX: "-50%" }}
              // Starts at full size when the pop-in is skipped: a start state that
              // is never animated away would leave the text shrunken for good.
              initial={{ opacity: 0, y: 0, scale: reduce ? 1 : 0.6 }}
              animate={reduce ? { opacity: [0, 1, 1, 0] } : { opacity: [0, 1, 1, 0], y: -84, scale: [0.6, 1.25, 1] }}
              transition={{ duration: reduce ? 1.1 : 1.5, ease: "easeOut", times: [0, 0.15, 0.7, 1] }}
            >
              <span className="drop-shadow-[0_2px_8px_color-mix(in_srgb,var(--gold)_55%,transparent)]">+{pop.amount} XP</span>
              {pop.label && <span className="text-sm text-accent-learning">{pop.label}</span>}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Portal>
  );
}
