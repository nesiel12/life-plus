"use client";

import { useEffect, useMemo, useState } from "react";
import { Flame, Loader2, Settings2, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { nutritionPaceTip, ringProgress, sumMacros, type HealthTargets } from "@/lib/health/nutrition";
import type { Meal } from "@/types";

const MACROS = [
  { key: "proteinG", label: "חלבון", unit: "ג׳", color: "var(--accent-career)" },
  { key: "carbsG", label: "פחמימות", unit: "ג׳", color: "var(--gold)" },
  { key: "fatG", label: "שומן", unit: "ג׳", color: "var(--accent-time)" },
] as const;

interface MacroRingsProps {
  meals: Meal[];
  targets: HealthTargets;
  custom: boolean;
  onSaveTargets: (targets: HealthTargets) => Promise<boolean>;
}

/**
 * Calories and the three macros as rings that fill through the day.
 *
 * A meal logged without an estimate is unknown, not zero: it is left out of
 * the rings and the card says so, rather than drawing a day of starving.
 */
export function MacroRings({ meals, targets, custom, onSaveTargets }: MacroRingsProps) {
  const totals = useMemo(() => sumMacros(meals), [meals]);
  const calories = ringProgress(totals.calories, targets.calories);
  const tip = nutritionPaceTip(totals, targets, new Date());
  const [editing, setEditing] = useState(false);

  return (
    <section className="glass-card flex h-full flex-col gap-4 rounded-3xl p-5" aria-labelledby="macros-title">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 id="macros-title" className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Flame size={17} className="text-accent-fitness" aria-hidden />
            תזונה היום
          </h2>
          <p className="text-xs text-muted">{custom ? "לפי היעדים שהגדרת" : "יעדים כלליים — אפשר להתאים אישית"}</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="focus-ring inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-muted transition-colors hover:text-foreground"
        >
          <Settings2 size={13} aria-hidden />
          יעדים
        </button>
      </header>

      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:justify-around">
        <ProgressRing
          value={calories.fraction}
          over={calories.over}
          size={148}
          stroke={12}
          color="var(--accent-fitness)"
          label={`קלוריות: ${totals.calories} מתוך ${targets.calories}`}
        >
          <div className="flex flex-col items-center">
            <span className="ltr text-2xl font-semibold tabular-nums text-foreground">{totals.calories.toLocaleString("he-IL")}</span>
            <span className="text-[0.7rem] text-muted">מתוך {targets.calories.toLocaleString("he-IL")} קק״ל</span>
            <span className="mt-0.5 text-[0.65rem] text-muted">
              {calories.over ? "מעל היעד" : `נותרו ${calories.remaining.toLocaleString("he-IL")}`}
            </span>
          </div>
        </ProgressRing>

        <div className="grid grid-cols-3 gap-3 sm:gap-5">
          {MACROS.map(({ key, label, unit, color }) => {
            const value = totals[key];
            const target = targets[key];
            const ring = ringProgress(value, target);
            return (
              <div key={key} className="flex flex-col items-center gap-1.5">
                <ProgressRing
                  value={ring.fraction}
                  over={ring.over}
                  size={84}
                  stroke={8}
                  color={color}
                  label={`${label}: ${Math.round(value)} מתוך ${target} גרם`}
                >
                  <span className="ltr text-sm font-semibold tabular-nums text-foreground">{Math.round(value)}</span>
                </ProgressRing>
                <span className="text-xs font-medium text-foreground/85">{label}</span>
                <span className="ltr text-[0.65rem] tabular-nums text-muted">
                  / {target}
                  {unit}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <p className="flex items-start gap-2 rounded-2xl bg-fill-subtle px-3.5 py-2.5 text-xs leading-relaxed text-foreground/85">
        <Sparkles size={13} className="mt-0.5 shrink-0 text-gold-ink" aria-hidden />
        {tip}
      </p>
      {totals.unknown > 0 && (
        <p className="text-[0.7rem] text-muted">
          {totals.unknown === 1 ? "ארוחה אחת נרשמה" : `${totals.unknown} ארוחות נרשמו`} בלי הערכת ערכים ואינן כלולות בטבעות.
        </p>
      )}

      <TargetsEditor open={editing} targets={targets} onClose={() => setEditing(false)} onSave={onSaveTargets} />
    </section>
  );
}

function TargetsEditor({
  open,
  targets,
  onClose,
  onSave,
}: {
  open: boolean;
  targets: HealthTargets;
  onClose: () => void;
  onSave: (targets: HealthTargets) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(targets);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Targets load after first paint; reopening must start from the saved values.
  useEffect(() => {
    if (open) {
      setDraft(targets);
      setError(null);
    }
  }, [open, targets]);

  const fields: { key: keyof HealthTargets; label: string; unit: string }[] = [
    { key: "calories", label: "קלוריות", unit: "קק״ל" },
    { key: "proteinG", label: "חלבון", unit: "גרם" },
    { key: "carbsG", label: "פחמימות", unit: "גרם" },
    { key: "fatG", label: "שומן", unit: "גרם" },
    { key: "waterMl", label: "מים", unit: "מ״ל" },
  ];

  return (
    <Modal open={open} onClose={onClose} align="center" label="יעדים יומיים" panelClassName="max-w-sm p-5">
      <h3 className="mb-1 text-base font-semibold text-foreground">יעדים יומיים</h3>
      <p className="mb-4 text-xs text-muted">היעדים שלך — הטבעות וכוס המים יתמלאו לפיהם.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError(null);
          const ok = await onSave(draft);
          setSaving(false);
          if (ok) onClose();
          else setError("השמירה נכשלה. בדוק שהערכים סבירים.");
        }}
        className="flex flex-col gap-3"
      >
        {fields.map(({ key, label, unit }) => (
          <label key={key} className="flex items-center justify-between gap-3 text-sm text-foreground">
            {label}
            <span className="flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                value={draft[key]}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: Number(e.target.value) }))}
                className="ltr w-24 rounded-xl border border-hairline-card bg-surface px-2.5 py-1.5 text-end tabular-nums outline-none focus:border-gold-line"
              />
              <span className="w-10 text-xs text-muted">{unit}</span>
            </span>
          </label>
        ))}
        {error && <p className="text-xs text-accent-family">{error}</p>}
        <div className="mt-1 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="focus-ring rounded-full px-3 py-1.5 text-xs text-muted">
            ביטול
          </button>
          <button
            type="submit"
            disabled={saving}
            className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-gold px-4 py-1.5 text-xs font-medium text-white disabled:opacity-60"
          >
            {saving && <Loader2 size={12} className="animate-spin" aria-hidden />}
            שמור
          </button>
        </div>
      </form>
    </Modal>
  );
}
