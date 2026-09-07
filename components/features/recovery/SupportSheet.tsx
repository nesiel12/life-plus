"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Heart, Loader2, Phone, Wind, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import type { RecoveryProgram } from "@/lib/recovery/streak";
import { cn } from "@/lib/utils";

interface SupportSheetProps {
  open: boolean;
  program: RecoveryProgram;
  streakDays: number;
  onClose: () => void;
  onLogUrge: (input: { intensity?: number; trigger?: string; note?: string }) => Promise<void>;
}

/** 4-7-8 breathing: the phases, in seconds. */
const BREATH_PHASES = [
  { label: "שאיפה", seconds: 4 },
  { label: "החזקה", seconds: 7 },
  { label: "נשיפה", seconds: 8 },
] as const;

/**
 * Grounding, when breathing is not enough.
 *
 * The 5-4-3-2-1 exercise, which works by occupying the senses rather than by
 * asking someone to reason their way out of a craving.
 */
const GROUNDING = [
  "חמישה דברים שאתה רואה סביבך",
  "ארבעה דברים שאתה יכול לגעת בהם",
  "שלושה דברים שאתה שומע",
  "שני דברים שאתה מריח",
  "דבר אחד שאתה יכול לטעום",
];

type Tab = "breathe" | "why" | "ground";

/**
 * The support surface, opened from one tap when a craving hits.
 *
 * Everything here is designed for someone who is not in a state to read
 * carefully: three tabs, large targets, no decisions with consequences. The
 * "why" tab shows the user's own reasons back to them, in their own words —
 * which is the single most effective thing this screen does, and the reason
 * the setup flow asks for them.
 *
 * Logging the craving is offered at the end, not demanded at the start:
 * making someone fill in a form before they get help would be the wrong order.
 */
export function SupportSheet({ open, program, streakDays, onClose, onLogUrge }: SupportSheetProps) {
  const reduce = useReducedMotion();
  const [tab, setTab] = useState<Tab>("breathe");
  const [phase, setPhase] = useState(0);
  const [cycles, setCycles] = useState(0);
  const [intensity, setIntensity] = useState<number | null>(null);
  const [trigger, setTrigger] = useState("");
  const [logging, setLogging] = useState(false);
  const [logged, setLogged] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset on each open: arriving mid-way through a previous breathing cycle,
  // or with a stale "logged" confirmation, would be disorienting.
  useEffect(() => {
    if (!open) return;
    setTab("breathe");
    setPhase(0);
    setCycles(0);
    setIntensity(null);
    setTrigger("");
    setLogged(false);
  }, [open]);

  // The breathing cycle advances itself, so nobody has to tap through it.
  useEffect(() => {
    if (!open || tab !== "breathe") return;
    timerRef.current = setTimeout(() => {
      setPhase((p) => {
        const next = (p + 1) % BREATH_PHASES.length;
        if (next === 0) setCycles((c) => c + 1);
        return next;
      });
    }, BREATH_PHASES[phase].seconds * 1000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [open, tab, phase]);

  async function logUrge() {
    setLogging(true);
    try {
      await onLogUrge({
        intensity: intensity ?? undefined,
        trigger: trigger.trim() || undefined,
      });
      setLogged(true);
    } catch {
      // Non-fatal by design: failing to record a craving must never be
      // presented as a failure to get through it.
      setLogged(true);
    } finally {
      setLogging(false);
    }
  }

  const current = BREATH_PHASES[phase];

  return (
    <Modal open={open} onClose={onClose} panelClassName="max-w-lg p-0 overflow-hidden">
      <div className="flex items-center justify-between border-b border-glass-border px-5 py-3.5">
        <p className="text-sm font-medium text-foreground">רגע. אתה לא חייב לעשות כלום עכשיו.</p>
        <button
          onClick={onClose}
          aria-label="סגור"
          className="focus-ring grid size-7 place-items-center rounded-lg text-muted hover:text-foreground"
        >
          <X size={15} aria-hidden />
        </button>
      </div>

      <div className="flex gap-1 border-b border-glass-border px-3 py-2" role="tablist">
        {(
          [
            { key: "breathe", label: "נשימה", icon: Wind },
            { key: "why", label: "למה", icon: Heart },
            { key: "ground", label: "עיגון", icon: Phone },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={cn(
              "focus-ring flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs transition-colors",
              tab === item.key
                ? "bg-gold-soft font-medium text-gold-ink"
                : "text-muted hover:text-foreground"
            )}
          >
            <item.icon size={13} aria-hidden />
            {item.label}
          </button>
        ))}
      </div>

      <div className="px-5 py-6">
        {tab === "breathe" && (
          <div className="flex flex-col items-center gap-5">
            <motion.div
              // The circle IS the instruction — it expands on the in-breath
              // and contracts on the out-breath, so it can be followed
              // without reading anything.
              animate={
                reduce
                  ? {}
                  : { scale: phase === 0 ? 1.25 : phase === 1 ? 1.25 : 0.85 }
              }
              transition={{ duration: current.seconds, ease: "easeInOut" }}
              className="grid size-32 place-items-center rounded-full bg-gold-soft"
            >
              <span className="text-lg font-medium text-gold-ink">{current.label}</span>
            </motion.div>
            <p className="text-sm text-muted">
              {current.seconds} שניות · {cycles > 0 ? `${cycles} מחזורים` : "עקוב אחרי המעגל"}
            </p>
            <p className="max-w-xs text-center text-xs text-muted">
              הדחף הזה יגיע לשיא ויירד תוך כמה דקות, גם אם לא תעשה כלום. זה מה שאתה עושה עכשיו —
              מחכה לו.
            </p>
          </div>
        )}

        {tab === "why" && (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl bg-gold-soft/50 p-4 text-center">
              <p className="text-2xl font-semibold text-gold-ink">{streakDays}</p>
              <p className="text-xs text-gold-ink/80">
                {streakDays === 1 ? "יום נקי" : "ימים נקיים"} — זה מה שעל הכף
              </p>
            </div>

            {program.reasons.length > 0 ? (
              <div>
                <p className="mb-2 text-xs text-muted">הסיבות שכתבת בעצמך:</p>
                <ul className="flex flex-col gap-2">
                  {program.reasons.map((reason, i) => (
                    <li
                      key={i}
                      className="rounded-lg border border-hairline-card bg-surface px-3 py-2.5 text-sm text-foreground"
                    >
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-muted">
                לא כתבת עדיין סיבות. כשתהיה רגוע, שווה להוסיף אותן — הן מה שיופיע כאן בפעם הבאה.
              </p>
            )}

            {program.copingStrategies.length > 0 && (
              <div>
                <p className="mb-2 text-xs text-muted">מה שהחלטת לעשות במקום:</p>
                <ul className="flex flex-wrap gap-1.5">
                  {program.copingStrategies.map((strategy, i) => (
                    <li
                      key={i}
                      className="rounded-lg bg-fill-subtle px-2.5 py-1.5 text-xs text-foreground/85"
                    >
                      {strategy}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {tab === "ground" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">
              תעבור על אלה לאט. אין צורך לענות בקול — רק לשים לב.
            </p>
            <ol className="flex flex-col gap-2">
              {GROUNDING.map((item, i) => (
                <li
                  key={i}
                  className="flex items-center gap-3 rounded-lg border border-hairline-card bg-surface px-3 py-2.5"
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-gold-soft text-xs font-medium text-gold-ink">
                    {5 - i}
                  </span>
                  <span className="text-sm text-foreground">{item}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      <div className="border-t border-glass-border bg-surface-sunken/50 px-5 py-4">
        {logged ? (
          <p className="flex items-center justify-center gap-2 py-1 text-sm text-accent-health">
            <Check size={15} aria-hidden />
            נרשם. עברת את זה.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted">
              רוצה לתעד את הדחף? זה מה שעוזר למערכת לזהות מתי קשה לך.
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted">עוצמה</span>
              {[1, 2, 3, 4, 5].map((level) => (
                <button
                  key={level}
                  onClick={() => setIntensity(level)}
                  aria-pressed={intensity === level}
                  className={cn(
                    "focus-ring size-7 rounded-lg border text-xs transition-colors",
                    intensity === level
                      ? "border-gold-line bg-gold-soft font-medium text-gold-ink"
                      : "border-hairline-card text-muted hover:text-foreground"
                  )}
                >
                  {level}
                </button>
              ))}
            </div>
            <input
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              placeholder="מה עורר את זה? (לא חובה)"
              aria-label="מה עורר את הדחף"
              maxLength={80}
              className="focus-ring rounded-lg border border-hairline-card bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted"
            />
            <button
              onClick={logUrge}
              disabled={logging}
              className="focus-ring flex items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-[var(--background)] disabled:opacity-50"
            >
              {logging && <Loader2 size={14} className="animate-spin" aria-hidden />}
              עברתי את זה
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
