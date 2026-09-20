"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Loader2, Mic, MicOff, Minus, Sparkles, UtensilsCrossed, Wand2, X } from "lucide-react";
import { useSpeechInput } from "@/components/features/health/useSpeechInput";
import {
  MEAL_PRESETS,
  caloriesFromMacros,
  mealTypeForHour,
  sanitizeEstimate,
  type MacroEstimate,
} from "@/lib/health/nutrition";
import { macBackdropVariants } from "@/lib/motion/macLaunch";
import { cn } from "@/lib/utils";
import type { MacroSource, MealType } from "@/types";
import type { NewMealInput } from "@/app/actions/health";

const MEAL_TYPES: { type: MealType; label: string }[] = [
  { type: "breakfast", label: "בוקר" },
  { type: "lunch", label: "צהריים" },
  { type: "dinner", label: "ערב" },
  { type: "snack", label: "נשנוש" },
  { type: "post-workout", label: "אחרי אימון" },
];

interface PlateItem extends MacroEstimate {
  key: string;
  name: string;
  source: MacroSource;
}

interface MealQuickLogProps {
  open: boolean;
  onClose: () => void;
  onLog: (meal: NewMealInput) => Promise<void>;
}

/**
 * The quick-log drawer: build a plate from one-tap presets, or describe the
 * meal — typed or spoken — and let the AI itemise it, then log it with its
 * macros in one press.
 *
 * Everything lands on the "plate" first, where it can be reviewed and removed.
 * An AI estimate is never logged sight unseen.
 */
export function MealQuickLog({ open, onClose, onLog }: MealQuickLogProps) {
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [type, setType] = useState<MealType>(() => mealTypeForHour(new Date().getHours()));
  const [plate, setPlate] = useState<PlateItem[]>([]);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [estimating, setEstimating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const speech = useSpeechInput(setText);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    setType(mealTypeForHour(new Date().getHours()));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const totals = useMemo(() => {
    const sum = plate.reduce(
      (acc, item) => ({
        calories: acc.calories + item.calories,
        proteinG: acc.proteinG + item.proteinG,
        carbsG: acc.carbsG + item.carbsG,
        fatG: acc.fatG + item.fatG,
      }),
      { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }
    );
    return { ...sum, calories: Math.round(sum.calories) };
  }, [plate]);

  function addPreset(id: string) {
    const preset = MEAL_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    // The meal slot stays the clock's (or the learner's own pick): yogurt at
    // 12:30 is lunch, whatever a yogurt preset usually is.
    setPlate((prev) => [...prev, { ...preset, key: `${preset.id}-${Date.now()}`, name: preset.label, source: "preset" }]);
  }

  async function estimate() {
    if (text.trim().length < 2) return;
    setEstimating(true);
    setError(null);
    try {
      const response = await fetch("/api/health/estimate-meal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(typeof data.error === "string" ? data.error : "ההערכה נכשלה.");
        return;
      }
      setPlate((prev) => [
        ...prev,
        ...(data.items as (MacroEstimate & { name: string })[]).map((item, i) => ({
          ...sanitizeEstimate(item),
          name: item.name,
          key: `ai-${Date.now()}-${i}`,
          source: "ai" as const,
        })),
      ]);
      if (!title) setTitle(data.title);
      setConfidence(typeof data.confidence === "number" ? data.confidence : null);
      setText("");
    } catch {
      setError("ההערכה נכשלה. בדוק את החיבור.");
    } finally {
      setEstimating(false);
    }
  }

  async function save() {
    if (plate.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const source: MacroSource = plate.some((i) => i.source === "ai") ? "ai" : "preset";
      await onLog({
        description: title.trim() || plate.map((i) => i.name).join(" + ").slice(0, 200),
        type,
        eatenAt: new Date().toISOString(),
        calories: totals.calories || caloriesFromMacros(totals.proteinG, totals.carbsG, totals.fatG),
        proteinG: Math.round(totals.proteinG * 10) / 10,
        carbsG: Math.round(totals.carbsG * 10) / 10,
        fatG: Math.round(totals.fatG * 10) / 10,
        macroSource: source,
      });
      setPlate([]);
      setTitle("");
      setConfidence(null);
      onClose();
    } catch {
      setError("הרישום נכשל. נסה שוב.");
    } finally {
      setSaving(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="meal-drawer"
          variants={macBackdropVariants(Boolean(reduceMotion))}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px]"
          onClick={onClose}
        >
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="רישום ארוחה"
            onClick={(e) => e.stopPropagation()}
            initial={reduceMotion ? { opacity: 0 } : { x: "100%" }}
            animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { x: "100%" }}
            transition={{ type: "spring", visualDuration: 0.35, bounce: 0.05 }}
            className="glass-panel absolute inset-y-0 start-0 flex w-full max-w-md flex-col overflow-hidden border-s border-glass-border bg-background shadow-2xl will-change-transform"
          >
            <header className="flex items-center justify-between gap-3 border-b border-hairline-card px-5 py-4">
              <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                <UtensilsCrossed size={17} className="text-accent-fitness" aria-hidden />
                רישום ארוחה
              </h2>
              <button type="button" onClick={onClose} aria-label="סגור" className="focus-ring rounded-lg p-1.5 text-muted hover:text-foreground">
                <X size={18} aria-hidden />
              </button>
            </header>

            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
              <div role="radiogroup" aria-label="סוג הארוחה" className="flex flex-wrap gap-1.5">
                {MEAL_TYPES.map((option) => (
                  <button
                    key={option.type}
                    type="button"
                    role="radio"
                    aria-checked={type === option.type}
                    onClick={() => setType(option.type)}
                    className={cn(
                      "focus-ring rounded-full border px-3 py-1.5 text-xs transition-colors",
                      type === option.type
                        ? "border-accent-fitness/50 bg-accent-fitness/12 text-foreground"
                        : "border-hairline-card bg-surface text-foreground/80 hover:border-accent-fitness/40"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <section aria-label="ארוחות מוכנות">
                <p className="mb-2 text-xs font-medium text-muted">בלחיצה אחת</p>
                <div className="grid grid-cols-2 gap-2">
                  {MEAL_PRESETS.map((preset) => (
                    <motion.button
                      key={preset.id}
                      type="button"
                      onClick={() => addPreset(preset.id)}
                      whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                      className="focus-ring group flex items-center gap-2.5 rounded-2xl border border-hairline-card bg-surface px-3 py-2.5 text-start transition-[border-color,box-shadow] hover:border-accent-fitness/40 hover:shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent-fitness)_10%,transparent)]"
                    >
                      <span className="text-xl" aria-hidden>
                        {preset.emoji}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium text-foreground">{preset.label}</span>
                        <span className="ltr block text-end text-[0.65rem] tabular-nums text-muted">{preset.calories} kcal</span>
                      </span>
                    </motion.button>
                  ))}
                </div>
              </section>

              <section aria-label="תיאור חופשי" className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted">או ספר מה אכלת — בהקלדה או בקול</p>
                <div className="flex items-end gap-2 rounded-2xl border border-hairline-card bg-surface p-1.5 ps-3 focus-within:border-accent-fitness/50">
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={2}
                    maxLength={400}
                    placeholder="למשל: שתי ביצים, פרוסת לחם מלא וסלט ירקות"
                    aria-label="תיאור הארוחה"
                    className="min-w-0 flex-1 resize-none bg-transparent py-1.5 text-sm text-foreground outline-none placeholder:text-muted"
                  />
                  {speech.supported && (
                    <button
                      type="button"
                      onClick={speech.listening ? speech.stop : speech.start}
                      aria-label={speech.listening ? "הפסק הקלטה" : "הכתב בקול"}
                      aria-pressed={speech.listening}
                      className={cn(
                        "focus-ring relative grid size-9 shrink-0 place-items-center rounded-xl transition-colors",
                        speech.listening ? "bg-accent-family text-white" : "bg-fill-subtle text-muted hover:text-foreground"
                      )}
                    >
                      {speech.listening && <span className="absolute inset-0 animate-ping rounded-xl bg-accent-family/40" aria-hidden />}
                      {speech.listening ? <MicOff size={15} aria-hidden /> : <Mic size={15} aria-hidden />}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void estimate()}
                    disabled={text.trim().length < 2 || estimating}
                    className="focus-ring inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-accent-fitness px-3 text-xs font-medium text-white disabled:opacity-40"
                  >
                    {estimating ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Wand2 size={14} aria-hidden />}
                    הערך
                  </button>
                </div>
                {speech.error && <p className="text-xs text-accent-family">{speech.error}</p>}
              </section>

              <section aria-label="הצלחת" className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted">הצלחת</p>
                {plate.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-hairline-card px-4 py-5 text-center text-xs text-muted">
                    בחר מנה או תאר את הארוחה — הפריטים יופיעו כאן לבדיקה.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    <AnimatePresence initial={false}>
                      {plate.map((item) => (
                        <motion.li
                          key={item.key}
                          layout={!reduceMotion}
                          initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={reduceMotion ? undefined : { opacity: 0, x: 24 }}
                          className="flex items-center gap-2 rounded-xl bg-surface-sunken/70 px-3 py-2"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium text-foreground">{item.name}</span>
                            <span className="ltr block text-end text-[0.65rem] tabular-nums text-muted">
                              {item.calories} kcal · P {item.proteinG} · C {item.carbsG} · F {item.fatG}
                            </span>
                          </span>
                          {item.source === "ai" && (
                            <span className="rounded-full bg-gold-soft px-1.5 py-0.5 text-[0.6rem] text-gold-ink">הערכת AI</span>
                          )}
                          <button
                            type="button"
                            onClick={() => setPlate((prev) => prev.filter((p) => p.key !== item.key))}
                            aria-label={`הסר ${item.name}`}
                            className="focus-ring rounded-md p-1 text-muted hover:text-accent-family"
                          >
                            <Minus size={13} aria-hidden />
                          </button>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                )}
                {confidence !== null && confidence < 0.6 && (
                  <p className="flex items-start gap-1.5 text-[0.7rem] text-muted">
                    <Sparkles size={11} className="mt-0.5 shrink-0 text-gold-ink" aria-hidden />
                    הכמויות לא היו ברורות, אז זו הערכה גסה. פירוט כמויות ישפר אותה.
                  </p>
                )}
              </section>

              {plate.length > 0 && (
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  placeholder="שם לארוחה (לא חובה)"
                  aria-label="שם הארוחה"
                  className="rounded-xl border border-hairline-card bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted focus:border-accent-fitness/50"
                />
              )}

              {error && <p className="text-xs text-accent-family">{error}</p>}
            </div>

            <footer className="flex items-center justify-between gap-3 border-t border-hairline-card px-5 py-4">
              <div className="ltr text-start text-xs tabular-nums text-muted">
                <span className="text-base font-semibold text-foreground">{totals.calories}</span> kcal
                <span className="ms-2">
                  P {Math.round(totals.proteinG)} · C {Math.round(totals.carbsG)} · F {Math.round(totals.fatG)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void save()}
                disabled={plate.length === 0 || saving}
                className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-accent-fitness px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {saving ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Check size={14} aria-hidden />}
                רשום ארוחה
              </button>
            </footer>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
