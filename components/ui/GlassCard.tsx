"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  /** Makes the whole card a keyboard-accessible clickable surface (e.g. a
   * Rabbi card opening its profile) instead of relying on an inner button —
   * optional, existing callers with no onClick are unaffected. */
  onClick?: () => void;
  /** Drops the card chrome (border, background, padding) and keeps only the
   * entry animation — for panels rendered *inside* another card, e.g. a
   * BentoCard on the dashboard, where nested frames read as clutter. */
  bare?: boolean;
}

export function GlassCard({ children, className, delay = 0, onClick, bare = false }: GlassCardProps) {
  const reduceMotion = useReducedMotion();

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!onClick) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  }

  return (
    <motion.div
      // The global CSS motion guardrail (app/globals.css) only kills
      // animation-duration/transition-duration — it can't reach framer's
      // per-frame inline transform/opacity, so this card (33 call sites,
      // one per dashboard widget) needs its own gate: no slide-and-fade
      // entrance, just an instant appearance, for anyone who's asked for
      // reduced motion.
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.5, delay, ease: "easeOut" }}
      onClick={onClick}
      onKeyDown={onClick ? handleKeyDown : undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={cn(
        // Tighter on a phone (native-app density) without shrinking font
        // sizes or the grid itself — sm: and up is the original p-6.
        bare ? "flex h-full w-full min-w-0 flex-col" : "glass-card rounded-2xl p-4 sm:p-6",
        onClick && "focus-ring cursor-pointer transition-transform hover:scale-[1.01]",
        className
      )}
    >
      {children}
    </motion.div>
  );
}
