"use client";

import { useId, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Droplets, Plus, Undo2 } from "lucide-react";
import { useWater } from "@/components/features/health/useHealthData";
import {
  WATER_PACE_LABELS,
  WATER_STEP_ML,
  litersLabel,
  waterFraction,
  waterPace,
  waterTotal,
} from "@/lib/health/water";
import { localMidnight } from "@/components/features/health/useHealthData";
import { cn } from "@/lib/utils";

// A standard tumbler: slightly tapered, rounded foot. The same path clips the
// water, so the liquid can never draw outside the glass.
const GLASS = "M22 12 L118 12 L106 176 Q104 186 94 186 L46 186 Q36 186 34 176 Z";
const TOP = 16;
const BOTTOM = 184;
// Two wavelengths of a gentle sine across 280px — twice the glass — so the
// drift loops seamlessly after translating one glass-width.
const WAVE = "M0 0 Q17.5 -5 35 0 T70 0 T105 0 T140 0 T175 0 T210 0 T245 0 T280 0 V220 H0 Z";

const PACE_TONES = {
  ahead: "bg-accent-health/12 text-accent-health",
  "on-track": "bg-accent-knowledge/12 text-accent-knowledge",
  behind: "bg-accent-fitness/12 text-accent-fitness",
  done: "bg-accent-health/15 text-accent-health",
} as const;

/**
 * The liquid water tracker: a glass that fills as you drink.
 *
 * The level springs to its new height on each tap while two offset waves drift
 * across the surface, and a few bubbles rise from the bottom — the tap should
 * feel like pouring, not like a counter incrementing.
 */
export function WaterTracker({ targetMl }: { targetMl: number }) {
  const reduceMotion = useReducedMotion();
  const uid = useId().replace(/:/g, "");
  const { logs, error, add, undo } = useWater();
  const [pours, setPours] = useState(0);

  const total = useMemo(() => waterTotal(logs ?? [], localMidnight()), [logs]);
  const fraction = waterFraction(total, targetMl);
  const { pace, expectedMl } = waterPace(total, targetMl, new Date());
  const level = BOTTOM - fraction * (BOTTOM - TOP);
  const glasses = Math.round(total / WATER_STEP_ML);

  function pour(ml: number) {
    setPours((n) => n + 1);
    void add(ml);
  }

  return (
    // `@container`: the card lays itself out by ITS OWN width, not the
    // viewport's — it sits in a third-width column on desktop and full width on
    // a phone, and only the card knows whether the glass and the controls fit
    // side by side.
    <section className="@container glass-card flex h-full flex-col gap-4 rounded-3xl p-5" aria-labelledby={`water-${uid}`}>
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 id={`water-${uid}`} className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Droplets size={17} className="text-accent-knowledge" aria-hidden />
            מים
          </h2>
          <p className="text-xs text-muted">יעד יומי {litersLabel(targetMl)}</p>
        </div>
        <span className={cn("rounded-full px-2.5 py-1 text-[0.7rem] font-medium", PACE_TONES[pace])}>{WATER_PACE_LABELS[pace]}</span>
      </header>

      <div className="flex flex-col items-center gap-4 @sm:flex-row @sm:gap-5">
        <svg
          viewBox="0 0 140 196"
          className="h-44 w-auto shrink-0 drop-shadow-[0_18px_28px_rgba(26,114,187,0.18)]"
          role="img"
          aria-label={`שתית ${litersLabel(total)} מתוך ${litersLabel(targetMl)}`}
        >
          <defs>
            <clipPath id={`glass-${uid}`}>
              <path d={GLASS} />
            </clipPath>
            <linearGradient id={`water-grad-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: "var(--accent-knowledge)", stopOpacity: 0.75 }} />
              <stop offset="100%" style={{ stopColor: "var(--accent-knowledge)", stopOpacity: 1 }} />
            </linearGradient>
          </defs>

          {/* The glass itself. */}
          <path d={GLASS} style={{ fill: "var(--surface)", stroke: "var(--hairline)" }} strokeWidth={2.5} />

          <g clipPath={`url(#glass-${uid})`}>
            <motion.g
              initial={false}
              animate={{ y: level }}
              transition={reduceMotion ? { duration: 0 } : { type: "spring", visualDuration: 0.9, bounce: 0.15 }}
            >
              {/* Back wave, lighter and slower; front wave on top, the other way. */}
              <path d={WAVE} className="animate-wave-slow" style={{ fill: "var(--accent-knowledge)", opacity: 0.35 }} />
              <path d={WAVE} transform="translate(0 3)" className="animate-wave-fast" style={{ fill: `url(#water-grad-${uid})` }} />
            </motion.g>

            {/* Bubbles on each pour. */}
            <AnimatePresence>
              {!reduceMotion &&
                fraction > 0 &&
                [0, 1, 2, 3].map((i) => (
                  <motion.circle
                    key={`${pours}-${i}`}
                    cx={46 + i * 16}
                    r={2 + (i % 2)}
                    style={{ fill: "white" }}
                    initial={{ cy: BOTTOM - 4, opacity: 0.8 }}
                    animate={{ cy: level + 8, opacity: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.1 + i * 0.2, ease: "easeOut", delay: i * 0.08 }}
                  />
                ))}
            </AnimatePresence>
          </g>

          {/* Gloss. */}
          <path d="M30 22 L38 170" style={{ stroke: "white" }} strokeWidth={5} strokeLinecap="round" opacity={0.28} />
          {/* Graduation marks at quarters. */}
          {[0.25, 0.5, 0.75].map((mark) => {
            const y = BOTTOM - mark * (BOTTOM - TOP);
            return <line key={mark} x1={100} x2={110} y1={y} y2={y} style={{ stroke: "var(--hairline)" }} strokeWidth={2} />;
          })}
        </svg>

        <div className="flex w-full min-w-0 flex-1 flex-col items-center gap-3 text-center @sm:items-stretch @sm:text-start">
          <div>
            <motion.p
              key={total}
              initial={reduceMotion ? false : { opacity: 0.4, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="ltr whitespace-nowrap text-3xl font-semibold tabular-nums tracking-tight text-foreground @sm:text-end"
            >
              {litersLabel(total)}
            </motion.p>
            <p className="text-xs text-muted">
              {glasses} כוסות · {Math.round(fraction * 100)}% מהיעד
            </p>
            {pace === "behind" && <p className="mt-1 text-[0.7rem] text-muted">לפי הקצב, עד עכשיו כדאי להגיע ל-{litersLabel(expectedMl)}</p>}
          </div>

          <div className="flex flex-wrap justify-center gap-2 @sm:justify-start">
            <motion.button
              type="button"
              onClick={() => pour(WATER_STEP_ML)}
              whileTap={reduceMotion ? undefined : { scale: 0.94 }}
              className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-accent-knowledge px-3.5 py-2 text-sm font-medium text-white shadow-[0_8px_20px_-8px_var(--accent-knowledge)]"
            >
              <Plus size={14} aria-hidden />
              250 מ״ל
            </motion.button>
            <motion.button
              type="button"
              onClick={() => pour(500)}
              whileTap={reduceMotion ? undefined : { scale: 0.94 }}
              className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-hairline-card bg-surface px-3 py-2 text-sm text-foreground/85 hover:border-accent-knowledge/40"
            >
              <Plus size={13} aria-hidden />
              בקבוק 500
            </motion.button>
            {(logs?.length ?? 0) > 0 && (
              <button
                type="button"
                onClick={() => void undo()}
                aria-label="בטל את הרישום האחרון"
                className="focus-ring inline-flex items-center gap-1 rounded-full px-2.5 py-2 text-xs text-muted hover:text-foreground"
              >
                <Undo2 size={13} aria-hidden />
                ביטול
              </button>
            )}
          </div>

          <AnimatePresence>
            {pace === "done" && (
              <motion.p
                initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex w-fit items-center gap-1 rounded-full bg-accent-health/12 px-2.5 py-1 text-xs font-medium text-accent-health"
              >
                <Check size={12} aria-hidden />
                יעד המים הושג היום
              </motion.p>
            )}
          </AnimatePresence>
          {error && <p className="text-xs text-accent-family">{error}</p>}
        </div>
      </div>
    </section>
  );
}
