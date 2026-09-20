"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Lightbulb, Loader2, Swords } from "lucide-react";

const MAX_HINTS = 3;

/**
 * "רמז מהחברותא" — a floating, Socratic nudge.
 *
 * Each press asks for one step further (the previous hints go with the
 * request), never the answer; after three the button retires — by then the
 * learner should answer and read the reasoned answer.
 */
export function HavrutaHint({ questionId, draft }: { questionId: string; draft: string }) {
  const reduceMotion = useReducedMotion();
  const [hints, setHints] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/torah/practice/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, draft, previous: hints }),
      });
      const data = await response.json();
      if (!response.ok || !data.hint) {
        setError(typeof data.error === "string" ? data.error : "הרמז נכשל.");
        return;
      }
      setHints((prev) => [...prev, data.hint]);
    } catch {
      setError("הרמז נכשל. נסה שוב.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <AnimatePresence initial={false}>
        {hints.map((hint, i) => (
          <motion.div
            key={i}
            initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="relative flex items-start gap-2.5 rounded-2xl rounded-ss-sm border border-accent-career/25 bg-accent-career/8 px-3.5 py-2.5"
          >
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-career/15 text-accent-career" aria-hidden>
              <Swords size={12} />
            </span>
            <p className="text-sm leading-relaxed text-foreground/90">
              <span className="me-1 text-[0.65rem] font-semibold text-accent-career">רמז {i + 1}</span>
              {hint}
            </p>
          </motion.div>
        ))}
      </AnimatePresence>
      {error && <p className="text-xs text-accent-family">{error}</p>}
      {hints.length < MAX_HINTS && (
        <motion.button
          type="button"
          onClick={() => void ask()}
          disabled={loading}
          animate={reduceMotion || hints.length > 0 ? undefined : { y: [0, -3, 0] }}
          transition={reduceMotion || hints.length > 0 ? undefined : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          className="focus-ring inline-flex w-fit items-center gap-1.5 rounded-full border border-accent-career/30 bg-surface px-3 py-1.5 text-xs font-medium text-accent-career shadow-[0_6px_18px_-8px_var(--accent-career)] transition-colors hover:bg-accent-career/8 disabled:opacity-60"
        >
          {loading ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Lightbulb size={13} aria-hidden />}
          {hints.length === 0 ? "רמז מהחברותא" : "עוד רמז"}
        </motion.button>
      )}
    </div>
  );
}
