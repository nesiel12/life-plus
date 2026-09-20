"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BookOpen, Check, Droplets, Plus, Sparkles, Target, Undo2, Zap } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { useInsights } from "@/hooks/useInsights";
import { localMidnight, useHealthTargets, useWater } from "@/components/features/health/useHealthData";
import { WATER_STEP_ML, litersLabel, waterFraction, waterTotal } from "@/lib/health/water";
import { pickTopGoals } from "@/lib/dashboard/contextData";
import { windowRangeLabel, type EnergyGuidance } from "@/lib/dashboard/context";
import type { HebrewCalendarResponse } from "@/app/api/hebrew-calendar/route";
import { ContextCardShell } from "@/components/features/dashboard/context/ContextCardShell";
import { cn } from "@/lib/utils";

const HEBREW_FALLBACK: HebrewCalendarResponse = {
  hebrewDate: "",
  hebrewDateGematriya: "",
  todayHolidays: [],
  upcoming: [],
};

/** תורה ותפילה — a quiet way into the day's learning. No invented tefilla times:
 *  the app has none, so it offers the Torah space and today's date, not a schedule. */
export function TorahCard() {
  const { data } = useInsights<HebrewCalendarResponse>("/api/hebrew-calendar", HEBREW_FALLBACK);
  const date = data?.hebrewDateGematriya || data?.hebrewDate;
  const holiday = data?.todayHolidays[0];

  return (
    <ContextCardShell icon={BookOpen} title="תורה ותפילה" iconClass="text-accent-faith" href="/areas/torah" cta="למרחב התורה">
      <p className="text-sm leading-relaxed text-foreground/90">
        {holiday ? `${holiday} — ` : ""}
        {date ? `${date}. ` : ""}
        להתחיל את היום בשורה אחת של לימוד, ואז לתפילה.
      </p>
      <div className="flex flex-wrap gap-1.5">
        <Link
          href="/areas/torah/havruta"
          className="focus-ring rounded-full border border-hairline-card px-2.5 py-1 text-xs text-muted transition-colors hover:text-foreground"
        >
          חברותא
        </Link>
        <Link
          href="/areas/torah/lessons"
          className="focus-ring rounded-full border border-hairline-card px-2.5 py-1 text-xs text-muted transition-colors hover:text-foreground"
        >
          שיעורים
        </Link>
      </div>
    </ContextCardShell>
  );
}

/**
 * Water, with an optional link into meal logging (the work window's
 * "hydration/nutrition"). Uses the same hook and route as the Health page's
 * tracker, so a glass here is the same glass there.
 */
export function WaterCard({ withMeal = false }: { withMeal?: boolean }) {
  const { targets } = useHealthTargets();
  const { logs, error, add, undo, pending } = useWater();
  const total = useMemo(() => waterTotal(logs ?? [], localMidnight()), [logs]);
  const fraction = waterFraction(total, targets.waterMl);

  return (
    <ContextCardShell
      icon={Droplets}
      title={withMeal ? "מים ותזונה" : "מים"}
      iconClass="text-accent-knowledge"
      href="/areas/health"
      cta="לבריאות"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-lg font-semibold text-foreground">
          {logs === null ? "…" : litersLabel(total)}
        </span>
        <span className="text-xs text-muted">מתוך {litersLabel(targets.waterMl)}</span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-fill-subtle"
        role="progressbar"
        aria-label="שתיית מים היום"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fraction * 100)}
      >
        <div className="h-full rounded-full bg-accent-knowledge transition-[width] duration-500" style={{ width: `${fraction * 100}%` }} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => void add(WATER_STEP_ML)}
          className="focus-ring flex items-center gap-1 rounded-lg bg-accent-knowledge/15 px-2.5 py-1.5 text-xs font-medium text-accent-knowledge transition-opacity hover:opacity-80"
        >
          <Plus size={12} aria-hidden />
          כוס
        </button>
        <button
          onClick={() => void undo()}
          disabled={!logs?.length || pending}
          aria-label="בטל את הכוס האחרונה"
          className="focus-ring flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted transition-colors hover:text-foreground disabled:opacity-40"
        >
          <Undo2 size={12} aria-hidden />
          בטל
        </button>
        {withMeal && (
          <Link
            href="/areas/health"
            className="focus-ring ms-auto rounded-lg bg-fill-subtle px-2.5 py-1.5 text-xs text-foreground transition-opacity hover:opacity-80"
          >
            רשום ארוחה
          </Link>
        )}
      </div>
      {error && <p className="text-xs text-accent-family">{error}</p>}
    </ContextCardShell>
  );
}

/** שלושת הדברים החשובים — the next step on each of the three goals closest to due. */
export function TopThreeCard() {
  const goals = useAtlasStore((s) => s.goals);
  const toggleMilestone = useAtlasStore((s) => s.toggleMilestone);
  const [error, setError] = useState<string | null>(null);
  const focus = useMemo(() => pickTopGoals(goals, 3), [goals]);

  return (
    <ContextCardShell icon={Target} title="שלושת הדברים היום" iconClass="text-accent-career">
      {focus.length === 0 ? (
        <p className="text-xs text-muted">אין יעדים פתוחים — אפשר להגדיר יעד חדש בלוח היעדים.</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {focus.map(({ goal, next }) => (
            <li key={goal.id} className="flex min-w-0 items-start gap-2">
              <button
                onClick={() => {
                  setError(null);
                  toggleMilestone(goal.id, next.id).catch(() => setError("העדכון לא נשמר."));
                }}
                aria-label={`סמן כבוצע: ${next.title}`}
                className="focus-ring group mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border border-hairline-card text-accent-health transition-colors hover:bg-accent-health/10"
              >
                <Check size={10} className="opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
              </button>
              <span className="min-w-0 text-sm leading-snug">
                <span className="block truncate text-foreground">{next.title}</span>
                <span className="block truncate text-xs text-muted">{goal.title}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {error && <p className="text-xs text-accent-family">{error}</p>}
    </ContextCardShell>
  );
}

const BAND_LABEL: Record<EnergyGuidance["band"], string> = {
  peak: "שיא",
  steady: "יציבה",
  low: "נמוכה",
  rest: "מנוחה",
};

const BAND_TONE: Record<EnergyGuidance["band"], string> = {
  peak: "bg-accent-fitness/15 text-accent-fitness",
  steady: "bg-accent-knowledge/15 text-accent-knowledge",
  low: "bg-fill-subtle text-muted",
  rest: "bg-fill-subtle text-muted",
};

/**
 * חלון האנרגיה — the circadian model (lib/health/energyCurve.ts) read for right
 * now: the level, what kind of work it suits, and the day's peaks. It is the
 * same model the Health page charts, and it is an estimate, and says so.
 */
export function EnergyCard({ energy }: { energy: EnergyGuidance }) {
  return (
    <ContextCardShell icon={Zap} title="חלון האנרגיה" iconClass="text-accent-fitness" href="/areas/health" cta="לגרף המלא">
      <div className="flex items-center gap-2">
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", BAND_TONE[energy.band])}>
          {BAND_LABEL[energy.band]}
        </span>
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-fill-subtle"
          role="progressbar"
          aria-label="רמת אנרגיה משוערת"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(energy.level * 100)}
        >
          <div className="h-full rounded-full bg-accent-fitness transition-[width] duration-500" style={{ width: `${energy.level * 100}%` }} />
        </div>
      </div>
      <p className="text-xs leading-relaxed text-foreground/85">{energy.advice}</p>
      {energy.peaks.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <Sparkles size={11} className="text-accent-fitness" aria-hidden />
          שיאים היום:
          {energy.peaks.map((peak) => (
            <span key={peak.startHour} className="ltr rounded bg-fill-subtle px-1.5 py-0.5 text-foreground/80">
              {windowRangeLabel(peak)}
            </span>
          ))}
        </p>
      )}
      <p className="text-[0.7rem] text-muted">הערכה על בסיס שעות השינה וההעדפות שלך.</p>
    </ContextCardShell>
  );
}
