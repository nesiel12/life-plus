"use client";

import { useEffect, useMemo, useState } from "react";
import { Dumbbell, Flame, Loader2, Pencil, Target, TrendingDown } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { getFitnessGoalsAction, saveFitnessGoalsAction } from "@/app/actions/health";
import { startOfWeek } from "@/lib/calendar/ranges";
import { Modal, Z_INDEX } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import type { FitnessGoals as FitnessGoalsData } from "@/types";

interface FitnessGoalsProps {
  /** Today's totals, already summed by the Health page. */
  todayCalories: number;
  todayProtein: number;
}

type NumericField =
  | "startWeightKg"
  | "currentWeightKg"
  | "targetWeightKg"
  | "weeklyWorkoutTarget"
  | "dailyCalorieTarget"
  | "dailyProteinTarget";

function pct(value: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / target) * 100)));
}

function ProgressCard({
  icon,
  label,
  currentText,
  targetText,
  ratio,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  currentText: string;
  targetText: string;
  ratio: number;
  tone: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-hairline-card bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
          {icon}
          {label}
        </span>
        <span className="ltr text-xs tabular-nums text-muted">{targetText}</span>
      </div>
      <p className="ltr text-lg font-semibold tabular-nums text-foreground">{currentText}</p>
      <div className="h-1.5 overflow-hidden rounded-full bg-fill-subtle">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${Math.max(0, Math.min(100, ratio))}%`, backgroundColor: `var(${tone})` }}
        />
      </div>
    </div>
  );
}

// Personal Fitness & Body Goals — set targets once, then every card's
// "current" is read live from what's already logged: workouts this week from
// the store, calories/protein from today's meals. Only weight is entered by
// hand, because nothing else in the app knows it.
export function FitnessGoals({ todayCalories, todayProtein }: FitnessGoalsProps) {
  const workouts = useAtlasStore((s) => s.workouts);

  const [goals, setGoals] = useState<FitnessGoalsData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getFitnessGoalsAction()
      .then((g) => {
        if (!cancelled) setGoals(g);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const workoutsThisWeek = useMemo(() => {
    const from = startOfWeek(new Date()).getTime();
    return workouts.filter((w) => new Date(w.startTime).getTime() >= from).length;
  }, [workouts]);

  function openEditor() {
    const g = goals ?? {};
    setDraft({
      startWeightKg: g.startWeightKg?.toString() ?? "",
      currentWeightKg: g.currentWeightKg?.toString() ?? "",
      targetWeightKg: g.targetWeightKg?.toString() ?? "",
      bodyCompositionGoal: g.bodyCompositionGoal ?? "",
      weeklyWorkoutTarget: g.weeklyWorkoutTarget?.toString() ?? "",
      dailyCalorieTarget: g.dailyCalorieTarget?.toString() ?? "",
      dailyProteinTarget: g.dailyProteinTarget?.toString() ?? "",
    });
    setSaveError(null);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    const num = (key: NumericField) => {
      const v = parseFloat(draft[key] ?? "");
      return Number.isFinite(v) ? v : undefined;
    };
    const next: FitnessGoalsData = {
      startWeightKg: num("startWeightKg"),
      currentWeightKg: num("currentWeightKg"),
      targetWeightKg: num("targetWeightKg"),
      bodyCompositionGoal: draft.bodyCompositionGoal?.trim() || undefined,
      weeklyWorkoutTarget: num("weeklyWorkoutTarget"),
      dailyCalorieTarget: num("dailyCalorieTarget"),
      dailyProteinTarget: num("dailyProteinTarget"),
    };
    try {
      const saved = await saveFitnessGoalsAction(next);
      setGoals(saved);
      setEditing(false);
    } catch {
      setSaveError("השמירה נכשלה. נסה שוב.");
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <p className="text-sm text-muted">לא הצלחנו לטעון את מטרות הכושר.</p>
    );
  }

  if (!goals) {
    return (
      <p className="flex items-center gap-2 py-4 text-sm text-muted">
        <Loader2 size={14} className="animate-spin" aria-hidden />
        טוען מטרות…
      </p>
    );
  }

  const hasWeight =
    goals.targetWeightKg != null && goals.currentWeightKg != null && goals.startWeightKg != null;
  const losingWeight = hasWeight && goals.targetWeightKg! < goals.startWeightKg!;
  const weightRatio = hasWeight
    ? goals.startWeightKg === goals.targetWeightKg
      ? 100
      : pct(
          Math.abs(goals.startWeightKg! - goals.currentWeightKg!),
          Math.abs(goals.startWeightKg! - goals.targetWeightKg!)
        )
    : 0;

  const anyGoal =
    hasWeight ||
    goals.bodyCompositionGoal != null ||
    goals.weeklyWorkoutTarget != null ||
    goals.dailyCalorieTarget != null ||
    goals.dailyProteinTarget != null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Target size={16} className="text-accent-fitness" aria-hidden />
          מטרות כושר וגוף
        </p>
        <button
          onClick={openEditor}
          className="focus-ring flex items-center gap-1 rounded-lg border border-hairline-card px-2.5 py-1 text-xs text-muted transition-colors hover:text-foreground"
        >
          <Pencil size={11} aria-hidden />
          {anyGoal ? "עדכון" : "הגדרה"}
        </button>
      </div>

      {!anyGoal ? (
        <p className="text-xs text-muted">
          הגדר משקל יעד, כמות אימונים שבועית ויעדי קלוריות וחלבון — וכל מטרה תעודכן אוטומטית ממה
          שכבר רשמת.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {hasWeight && (
            <ProgressCard
              icon={<TrendingDown size={12} aria-hidden />}
              label={losingWeight ? "ירידה במשקל" : "משקל יעד"}
              currentText={`${goals.currentWeightKg} ק״ג`}
              targetText={`יעד ${goals.targetWeightKg} ק״ג`}
              ratio={weightRatio}
              tone="--accent-fitness"
            />
          )}
          {goals.weeklyWorkoutTarget != null && (
            <ProgressCard
              icon={<Dumbbell size={12} aria-hidden />}
              label="אימונים השבוע"
              currentText={`${workoutsThisWeek} / ${goals.weeklyWorkoutTarget}`}
              targetText={`${goals.weeklyWorkoutTarget} בשבוע`}
              ratio={pct(workoutsThisWeek, goals.weeklyWorkoutTarget)}
              tone="--accent-fitness"
            />
          )}
          {goals.dailyCalorieTarget != null && (
            <ProgressCard
              icon={<Flame size={12} aria-hidden />}
              label="קלוריות היום"
              currentText={`${Math.round(todayCalories)} / ${goals.dailyCalorieTarget}`}
              targetText={`יעד ${goals.dailyCalorieTarget}`}
              ratio={pct(todayCalories, goals.dailyCalorieTarget)}
              tone="--accent-health"
            />
          )}
          {goals.dailyProteinTarget != null && (
            <ProgressCard
              icon={<Flame size={12} aria-hidden />}
              label="חלבון היום"
              currentText={`${Math.round(todayProtein)} / ${goals.dailyProteinTarget} ג׳`}
              targetText={`יעד ${goals.dailyProteinTarget} ג׳`}
              ratio={pct(todayProtein, goals.dailyProteinTarget)}
              tone="--accent-health"
            />
          )}
          {goals.bodyCompositionGoal && (
            <div className="flex flex-col gap-1 rounded-xl border border-hairline-card bg-surface p-3 sm:col-span-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
                <Target size={12} aria-hidden />
                מסת שריר / הרכב גוף
              </span>
              <p className="text-sm text-foreground">{goals.bodyCompositionGoal}</p>
            </div>
          )}
        </div>
      )}

      <Modal open={editing} onClose={() => setEditing(false)} zIndex={Z_INDEX.modal} panelClassName="max-w-md p-5">
        <h2 className="mb-4 text-base font-medium text-foreground">מטרות כושר וגוף</h2>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2">
            <NumField label="משקל התחלה" unit='ק״ג' value={draft.startWeightKg} onChange={(v) => setDraft((d) => ({ ...d, startWeightKg: v }))} />
            <NumField label="משקל נוכחי" unit='ק״ג' value={draft.currentWeightKg} onChange={(v) => setDraft((d) => ({ ...d, currentWeightKg: v }))} />
            <NumField label="משקל יעד" unit='ק״ג' value={draft.targetWeightKg} onChange={(v) => setDraft((d) => ({ ...d, targetWeightKg: v }))} />
          </div>
          <label className="flex flex-col gap-1 text-xs text-muted">
            מסת שריר / הרכב גוף (טקסט חופשי)
            <input
              value={draft.bodyCompositionGoal ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, bodyCompositionGoal: e.target.value }))}
              placeholder='למשל: לעלות 4 ק״ג מסת שריר'
              className="focus-ring rounded-lg border border-hairline-card bg-surface-sunken px-3 py-2 text-sm text-foreground placeholder:text-muted"
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <NumField label="אימונים בשבוע" value={draft.weeklyWorkoutTarget} onChange={(v) => setDraft((d) => ({ ...d, weeklyWorkoutTarget: v }))} />
            <NumField label="קלוריות ליום" value={draft.dailyCalorieTarget} onChange={(v) => setDraft((d) => ({ ...d, dailyCalorieTarget: v }))} />
            <NumField label="חלבון ליום" unit='ג׳' value={draft.dailyProteinTarget} onChange={(v) => setDraft((d) => ({ ...d, dailyProteinTarget: v }))} />
          </div>

          {saveError && <p className="text-xs text-accent-family">{saveError}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setEditing(false)}
              disabled={saving}
              className="focus-ring rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:text-foreground disabled:opacity-50"
            >
              ביטול
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="focus-ring flex items-center gap-1.5 rounded-lg bg-accent-fitness/20 px-4 py-2 text-sm font-medium text-accent-fitness transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {saving && <Loader2 size={13} className="animate-spin" aria-hidden />}
              שמירה
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function NumField({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit?: string;
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <label className={cn("flex flex-col gap-1 text-[0.7rem] text-muted")}>
      <span className="truncate">{label}</span>
      <span className="flex items-center gap-1 rounded-lg border border-hairline-card bg-surface-sunken px-2 py-1.5">
        <input
          type="number"
          inputMode="decimal"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="focus-ring w-full bg-transparent text-sm tabular-nums text-foreground outline-none"
        />
        {unit && <span className="shrink-0 text-[0.65rem]">{unit}</span>}
      </span>
    </label>
  );
}
