"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLabReducedMotion } from "@/components/features/learning/lab/useLabMotion";
import { cn } from "@/lib/utils";

const CONIC =
  "conic-gradient(from 0deg, transparent 0deg, transparent 200deg, color-mix(in srgb, var(--accent-learning) 90%, transparent) 280deg, var(--gold) 330deg, transparent 360deg)";

interface GlowBorderProps {
  /** Whether the border is lit. */
  active: boolean;
  children: ReactNode;
  className?: string;
  /** Tailwind radius class shared by the frame and its inner surface. */
  radius?: string;
  /** Seconds per revolution. */
  seconds?: number;
}

/**
 * A border that lights up with a light travelling around it.
 *
 * The travelling light is an oversized conic-gradient square, clipped to the
 * frame, that *rotates* — a transform on a compositor layer, where animating the
 * gradient's own angle (or a box-shadow) would repaint every frame. The layer is
 * only mounted while active, so a grid of idle cards runs no animation at all.
 * With reduced motion the light holds still instead of circling.
 */
export function GlowBorder({ active, children, className, radius = "rounded-2xl", seconds = 3.4 }: GlowBorderProps) {
  const reduce = useLabReducedMotion();

  return (
    <div className={cn("relative border border-hairline-card p-px", radius, className)}>
      <AnimatePresence>
        {active && (
          <motion.span
            key="glow"
            aria-hidden
            className={cn("pointer-events-none absolute -inset-px overflow-hidden", radius)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <motion.span
              className="absolute left-1/2 top-1/2 aspect-square w-[240%] -translate-x-1/2 -translate-y-1/2"
              style={{ background: CONIC }}
              animate={reduce ? undefined : { rotate: 360 }}
              transition={{ duration: seconds, ease: "linear", repeat: Infinity }}
            />
          </motion.span>
        )}
      </AnimatePresence>
      <div className={cn("relative bg-surface", radius)}>{children}</div>
    </div>
  );
}
