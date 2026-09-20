"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Phone } from "lucide-react";

// The Companion's SOS mode ("קשה לי עכשיו").
//
// Deliberately inert: no store, no fetch, no storage, no logging, no model.
// Everything on screen is fixed text and a timer, and it exists only in this
// component's state — closing the panel leaves nothing behind. That is the
// point of deciding SOS locally (lib/ai/fabIntents.ts isSosMessage): a moment
// like this should not become a row, a log line, or a prompt.
//
// The pacing is a long exhale (4s in, 6s out), the simplest well-worn way to
// slow down; the copy makes no promise beyond "you don't have to solve
// anything right now".

const INHALE_S = 4;
const EXHALE_S = 6;
const SMALL_STEP_AFTER_CYCLES = 2;

export function SosPanel({ onExit }: { onExit: () => void }) {
  const reduceMotion = Boolean(useReducedMotion());
  const [phase, setPhase] = useState<"in" | "out">("in");
  const [cycles, setCycles] = useState(0);

  useEffect(() => {
    const timer = setTimeout(
      () => {
        if (phase === "out") setCycles((c) => c + 1);
        setPhase((p) => (p === "in" ? "out" : "in"));
      },
      (phase === "in" ? INHALE_S : EXHALE_S) * 1000
    );
    return () => clearTimeout(timer);
  }, [phase]);

  const inhale = phase === "in";

  return (
    <div className="flex flex-1 flex-col items-center justify-between overflow-y-auto px-6 py-8 text-center">
      <div>
        <p className="text-lg font-medium text-foreground">אני כאן.</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          זה בסדר שקשה. אין שום דבר שצריך לפתור ברגע הזה — רק לנשום, לאט.
        </p>
      </div>

      <div className="my-8 flex flex-col items-center gap-5">
        {/* The animated circle is decoration for the label under it; the label
            is what carries the instruction, so reduced-motion users lose the
            motion and nothing else. */}
        <div className="flex size-44 items-center justify-center" aria-hidden>
          <motion.div
            className="size-full rounded-full bg-gradient-to-br from-accent-faith/40 to-accent-knowledge/40 ring-1 ring-accent-faith/40"
            initial={{ scale: 0.6 }}
            animate={{ scale: reduceMotion ? 0.85 : inhale ? 1 : 0.6 }}
            transition={{ duration: reduceMotion ? 0 : inhale ? INHALE_S : EXHALE_S, ease: "easeInOut" }}
          />
        </div>
        {/* Announcing every phase change would talk over the exercise, so the
            visual label is hidden from assistive tech and one static sentence
            describes the whole practice instead. */}
        <p className="text-base text-foreground" aria-hidden>
          {inhale ? "שאיפה…" : "נשיפה איטית…"}
        </p>
        <p className="sr-only">תרגיל נשימה: שאיפה של ארבע שניות ונשיפה איטית של שש שניות. אפשר לחזור עליו כמה שצריך.</p>
      </div>

      <div className="flex w-full flex-col items-center gap-4">
        {cycles >= SMALL_STEP_AFTER_CYCLES && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2 }}
            className="text-sm leading-relaxed text-foreground/80"
          >
            כשתרגיש שאפשר — צעד קטן אחד, לא יותר: כוס מים, או לצאת לרגע לאוויר.
          </motion.p>
        )}

        <a
          href="tel:1201"
          className="focus-ring flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:text-foreground"
        >
          <Phone size={12} aria-hidden />
          <span>
            אם זה מרגיש כבד מדי, ער״ן זמינים בכל שעה — <span className="ltr">1201</span>
          </span>
        </a>

        <button
          onClick={onExit}
          className="focus-ring rounded-lg bg-fill-subtle px-4 py-2 text-sm text-foreground transition-opacity hover:opacity-80"
        >
          אני בסדר, חזרה
        </button>
      </div>
    </div>
  );
}
