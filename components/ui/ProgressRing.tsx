"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ProgressRingProps {
  /** 0..1 */
  value: number;
  size?: number;
  stroke?: number;
  /** A CSS color — usually a theme variable, e.g. "var(--accent-health)". */
  color: string;
  /** Drawn in a warning tone instead of `color` (e.g. over a target). */
  over?: boolean;
  children?: ReactNode;
  className?: string;
  /** Accessible description, e.g. "חלבון: 60 מתוך 130 גרם". */
  label: string;
}

/**
 * An animated progress ring.
 *
 * The arc draws with framer's `pathLength` — a stroke-dash animation on the
 * compositor, so it never reflows — on a spring that eases into place rather
 * than snapping. A soft glow of the same color sits behind the arc and grows
 * on hover, which is the ring's only affordance that it is live.
 */
export function ProgressRing({ value, size = 96, stroke = 9, color, over, children, className, label }: ProgressRingProps) {
  const reduceMotion = useReducedMotion();
  const radius = (size - stroke) / 2;
  const clamped = Math.min(1, Math.max(0, value));
  const tone = over ? "var(--accent-family)" : color;

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuetext={label}
      className={cn("group relative grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 overflow-visible" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} style={{ stroke: "var(--fill)" }} />
        {/* The glow: a blurred copy of the arc behind it. */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          style={{ stroke: tone, filter: "blur(6px)" }}
          className="opacity-25 transition-opacity duration-300 group-hover:opacity-60"
          initial={reduceMotion ? false : { pathLength: 0 }}
          animate={{ pathLength: clamped }}
          transition={{ type: "spring", visualDuration: 0.9, bounce: 0.1 }}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          style={{ stroke: tone }}
          initial={reduceMotion ? false : { pathLength: 0 }}
          animate={{ pathLength: clamped }}
          transition={{ type: "spring", visualDuration: 0.9, bounce: 0.1 }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}
