"use client";

import { motion } from "framer-motion";
import { Flame } from "lucide-react";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { useLabReducedMotion } from "@/components/features/learning/lab/useLabMotion";
import { cn } from "@/lib/utils";

const SPARKS = [
  { left: "28%", delay: 0, drift: -6 },
  { left: "52%", delay: 0.5, drift: 5 },
  { left: "70%", delay: 1.0, drift: -4 },
  { left: "40%", delay: 1.5, drift: 7 },
];

/**
 * The learning streak, as a flame that breathes.
 *
 * Lit only when there is a streak to show — a dark flame at zero says "start
 * one" without scolding. The flame pulses and a few sparks rise and fade, all
 * transforms and opacity; with reduced motion it simply glows.
 */
export function StreakFlame({ days, className }: { days: number; className?: string }) {
  const reduce = useLabReducedMotion();
  const lit = days > 0;

  return (
    <div
      className={cn("flex items-center gap-2", className)}
      role="img"
      aria-label={lit ? `רצף למידה: ${days} ימים` : "אין רצף למידה עדיין"}
    >
      <span className="relative grid size-10 place-items-center">
        <motion.span
          className={cn("relative", lit ? "text-accent-fitness" : "text-muted/50")}
          animate={lit && !reduce ? { scale: [1, 1.14, 1], rotate: [-4, 4, -4] } : undefined}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          style={lit ? { filter: "drop-shadow(0 0 8px color-mix(in srgb, var(--accent-fitness) 70%, transparent))" } : undefined}
        >
          <Flame size={26} aria-hidden fill={lit ? "currentColor" : "none"} />
        </motion.span>
        {lit && !reduce &&
          SPARKS.map((spark, i) => (
            <motion.span
              key={i}
              aria-hidden
              className="absolute bottom-3 size-1 rounded-full bg-accent-fitness"
              style={{ left: spark.left }}
              animate={{ y: [-2, -22], x: [0, spark.drift], opacity: [0, 0.9, 0], scale: [0.6, 1, 0.4] }}
              transition={{ duration: 1.9, delay: spark.delay, repeat: Infinity, ease: "easeOut" }}
            />
          ))}
      </span>
      <div className="leading-tight">
        <p className="text-lg font-semibold tabular-nums text-foreground">
          <NumberTicker value={days} />
        </p>
        <p className="text-[0.7rem] text-muted">ימי רצף</p>
      </div>
    </div>
  );
}
