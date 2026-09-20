"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

export interface Burst {
  id: number;
  amount: number;
  /** A combo-multiplied gain gets a bigger, golder burst. */
  boosted: boolean;
}

const SPARKS = 7;

/**
 * "+10 XP" rising from where the answer was given, with a ring of sparks.
 *
 * Positioned by the parent; each burst removes itself when it finishes, so a
 * fast run of answers stacks several without any bookkeeping.
 */
export function XpBursts({ bursts, onDone }: { bursts: Burst[]; onDone: (id: number) => void }) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="pointer-events-none absolute inset-x-0 top-1/3 z-20 flex justify-center" aria-hidden>
      <AnimatePresence>
        {bursts.map((burst) => (
          <motion.div
            key={burst.id}
            className="absolute"
            initial={{ opacity: 0, y: 0, scale: 0.6 }}
            animate={reduceMotion ? { opacity: [0, 1, 0] } : { opacity: [0, 1, 1, 0], y: -90, scale: [0.6, 1.15, 1, 0.95] }}
            transition={{ duration: 1.1, ease: "easeOut" }}
            onAnimationComplete={() => onDone(burst.id)}
          >
            <span
              className={
                burst.boosted
                  ? "ltr whitespace-nowrap rounded-full bg-gradient-to-l from-amber-400 to-orange-500 px-3 py-1 text-base font-bold text-white shadow-[0_8px_24px_-6px_rgba(245,158,11,0.8)]"
                  : "ltr whitespace-nowrap rounded-full bg-gold px-2.5 py-0.5 text-sm font-bold text-white shadow-lg"
              }
            >
              +{burst.amount} XP
            </span>
            {!reduceMotion &&
              Array.from({ length: SPARKS }, (_, i) => {
                const angle = (i / SPARKS) * Math.PI * 2;
                return (
                  <motion.span
                    key={i}
                    className="absolute left-1/2 top-1/2 size-1.5 rounded-full"
                    style={{ background: burst.boosted ? "rgb(245 158 11)" : "var(--gold)" }}
                    initial={{ x: 0, y: 0, opacity: 1 }}
                    animate={{ x: Math.cos(angle) * 46, y: Math.sin(angle) * 46, opacity: 0 }}
                    transition={{ duration: 0.7, ease: "easeOut" }}
                  />
                );
              })}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
