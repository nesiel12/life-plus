"use client";

import { useMemo } from "react";
import { dateKey, isSameDay } from "@/lib/calendar/ranges";
import { HEAT_STEPS, heatLevel } from "@/lib/gamification/dailyActivity";
import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";

interface HeatmapGridProps {
  /** Sparse "YYYY-MM-DD" -> completion count, from getMomentumDashboardAction. */
  counts: Record<string, number>;
  peak: number;
  /** How many trailing weeks to show — 53 covers a full year plus the
   *  partial current week, matching GitHub's own contribution graph. */
  weeks?: number;
}

const WEEKDAY_INITIALS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

/** color-mix ramp over the Time & Tasks accent — same technique
 *  components/features/calendar/YearView.tsx already uses for its own heat
 *  bands, kept in its own accent here since this heatmap is about
 *  execution (tasks + habits), not the calendar. */
const HEAT_CLASS = [
  "bg-fill-subtle",
  "bg-[color-mix(in_srgb,var(--accent-time)_22%,transparent)]",
  "bg-[color-mix(in_srgb,var(--accent-time)_42%,transparent)]",
  "bg-[color-mix(in_srgb,var(--accent-time)_66%,transparent)]",
  "bg-[color-mix(in_srgb,var(--accent-time)_92%,transparent)]",
];

/**
 * A GitHub-style contribution grid: one column per week, one cell per day,
 * shaded by how many tasks/habits landed that day. Counts arrive already
 * aggregated server-side (lib/gamification/dailyActivity.ts) — this only
 * walks the trailing `weeks` weeks and looks each day up, the same division
 * of labour YearView already uses for the calendar's own heat grid.
 */
export function HeatmapGrid({ counts, peak, weeks = 53 }: HeatmapGridProps) {
  const today = useMemo(() => new Date(), []);

  // Columns run oldest -> newest, each a Sunday-to-Saturday week, so the
  // grid always ends on today's own column.
  const columns = useMemo(() => {
    const totalDays = weeks * 7;
    const endOfWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() + (6 - today.getDay()));
    const start = new Date(endOfWeek.getFullYear(), endOfWeek.getMonth(), endOfWeek.getDate() - totalDays + 1);

    return Array.from({ length: weeks }, (_, week) =>
      Array.from({ length: 7 }, (_, day) => {
        const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + week * 7 + day);
        const key = dateKey(date);
        return { date, key, count: counts[key] ?? 0, isFuture: date > today };
      })
    );
  }, [counts, today, weeks]);

  const totalCompletions = useMemo(() => Object.values(counts).reduce((sum, n) => sum + n, 0), [counts]);

  return (
    <GlassCard className="flex flex-col gap-3">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">מפת החום היומית</h3>
        <span className="ltr text-xs tabular-nums text-muted">{totalCompletions} השלמות בשנה האחרונה</span>
      </header>

      <div className="ltr flex gap-[3px] overflow-x-auto pb-1">
        <div className="flex flex-col justify-between py-[1px]">
          {WEEKDAY_INITIALS.map((initial, i) => (
            <span key={initial} className={cn("text-[0.6rem] leading-[11px] text-muted", i % 2 === 0 && "opacity-0")} aria-hidden>
              {initial}
            </span>
          ))}
        </div>
        {columns.map((column, i) => (
          <div key={i} className="flex flex-col gap-[3px]">
            {column.map((day) =>
              day.isFuture ? (
                <span key={day.key} className="size-[11px]" aria-hidden />
              ) : (
                <span
                  key={day.key}
                  role="gridcell"
                  title={`${day.date.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" })} · ${day.count}`}
                  aria-label={`${day.key}: ${day.count} השלמות`}
                  className={cn(
                    "size-[11px] rounded-[2px] transition-transform hover:scale-125",
                    HEAT_CLASS[heatLevel(day.count, peak)],
                    isSameDay(day.date, today) && "ring-1 ring-[var(--accent-time)] ring-offset-1 ring-offset-[var(--surface)]"
                  )}
                />
              )
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1.5 text-[0.7rem] text-muted">
        <span>פחות</span>
        {Array.from({ length: HEAT_STEPS + 1 }, (_, i) => (
          <span key={i} className={cn("size-[10px] rounded-[2px]", HEAT_CLASS[i])} aria-hidden />
        ))}
        <span>יותר</span>
        {peak > 0 && <span className="ltr ms-auto tabular-nums">שיא: {peak} ביום</span>}
      </div>
    </GlassCard>
  );
}
