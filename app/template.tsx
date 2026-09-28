"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

// Runs on *every* route change app-wide — this is the one thing between a
// navigation landing and the new page's pixels. `y`/`opacity` are already
// the hardware-accelerated choice (framer animates them as `transform:
// translateY()` + `opacity`, composited off the main thread, never a
// layout-triggering property), but there was no reduced-motion gate: someone
// who's asked for less motion paid the same 400ms slide-and-fade on every
// single tap between Smart Day, Torah Space, Learning, Stats, etc. The
// global CSS guardrail (app/globals.css) can't reach this — it only zeroes
// out CSS animation/transition durations, not framer's per-frame inline
// styles — so, same as GlassCard/ProgressRing/Modal, the gate lives here.
export default function Template({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.4, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
