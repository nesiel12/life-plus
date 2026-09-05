"use client";

import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { useInsights } from "@/hooks/useInsights";
import { dateKey, daysInMonth, isSameDay } from "@/lib/calendar/ranges";
import { peakCount } from "@/lib/calendar/yearDensity";
import { cn } from "@/lib/utils";

interface YearViewProps {
  /** Any date within the year to show. */
  anchor: Date;
  /** Drilling into a month from the year overview. */
  onSelectMonth?: (date: Date) => void;
}

interface YearResponse {
  connected: boolean;
  year: number;
  counts: Record<string, number>;
}

const FALLBACK: YearResponse = { connected: false, year: 0, counts: {} };

const WEEKDAY_INITIALS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

/** Four filled steps plus empty. More bands than this stop being readable at
 *  this square size, fewer stop distinguishing a busy day from a full one. */
const HEAT_STEPS = 4;

/**
 * Which heat band a day falls in, 0 (empty) to HEAT_STEPS.
 *
 * Scaled against the year's own busiest day rather than a fixed threshold:
 * "four meetings" is a heavy day for one person and a quiet one for another,
 * and a fixed scale would render one calendar uniformly pale and the next
 * uniformly dark.
 */
function heatStep(count: number, peak: number): number {
  if (count <= 0) return 0;
  if (peak <= 0) return 0;
  return Math.min(HEAT_STEPS, Math.ceil((count / peak) * HEAT_STEPS));
}

const HEAT_CLASS = [
  "bg-fill-subtle",
  "bg-[color-mix(in_srgb,var(--gold)_18%,transparent)]",
  "bg-[color-mix(in_srgb,var(--gold)_36%,transparent)]",
  "bg-[color-mix(in_srgb,var(--gold)_58%,transparent)]",
  "bg-[color-mix(in_srgb,var(--gold)_82%,transparent)]",
];

// The year at a glance: twelve month grids, each day shaded by how much was
// on the calendar that day.
//
// Counts come pre-aggregated from /api/calendar/year — a year of raw events
// would be a couple of thousand objects to render 365 squares from, and the
// aggregation itself (multi-day events, all-day timezone handling) is pure
// and tested in lib/calendar/yearDensity.ts.
export function YearView({ anchor, onSelectMonth }: YearViewProps) {
  const year = anchor.getFullYear();
  const { data, loading } = useInsights<YearResponse>(`/api/calendar/year?year=${year}`, FALLBACK, [year]);

  const counts = useMemo(() => data?.counts ?? {}, [data]);
  const peak = useMemo(() => peakCount(counts), [counts]);
  const today = useMemo(() => new Date(), []);

  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, monthIndex) => {
        const first = new Date(year, monthIndex, 1);
        const total = daysInMonth(year, monthIndex);
        return {
          monthIndex,
          label: first.toLocaleDateString("he-IL", { month: "long" }),
          // Blank cells for the weekdays before the 1st, so every column
          // lines up under its weekday initial.
          lead: first.getDay(),
          days: Array.from({ length: total }, (_, i) => new Date(year, monthIndex, i + 1)),
          monthTotal: Array.from({ length: total }, (_, i) =>
            counts[dateKey(new Date(year, monthIndex, i + 1))] ?? 0
          ).reduce((sum, n) => sum + n, 0),
        };
      }),
    [year, counts]
  );

  if (loading && !data) {
    return (
      <p className="flex items-center gap-2 py-8 text-sm text-muted">
        <Loader2 size={14} className="animate-spin" aria-hidden />
        טוען את השנה…
      </p>
    );
  }

  if (!data?.connected) {
    return <p className="py-8 text-sm text-muted">היומן לא מחובר, אז אין מה להראות כאן עדיין.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {months.map((month) => (
          <section key={month.monthIndex} className="flex flex-col gap-1.5">
            <header className="flex items-baseline justify-between gap-2">
              {onSelectMonth ? (
                <button
                  onClick={() => onSelectMonth(new Date(year, month.monthIndex, 1))}
                  className="focus-ring rounded text-sm font-medium text-foreground transition-colors hover:text-gold-ink"
                >
                  {month.label}
                </button>
              ) : (
                <span className="text-sm font-medium text-foreground">{month.label}</span>
              )}
              <span className="ltr text-[0.65rem] tabular-nums text-muted">{month.monthTotal}</span>
            </header>

            <div className="grid grid-cols-7 gap-0.5" role="grid" aria-label={month.label}>
              {WEEKDAY_INITIALS.map((initial, i) => (
                <span key={i} className="text-center text-[0.6rem] text-muted" aria-hidden>
                  {initial}
                </span>
              ))}
              {Array.from({ length: month.lead }, (_, i) => (
                <span key={`lead-${i}`} aria-hidden />
              ))}
              {month.days.map((day) => {
                const key = dateKey(day);
                const count = counts[key] ?? 0;
                const step = heatStep(count, peak);
                return (
                  <span
                    key={key}
                    role="gridcell"
                    title={`${day.toLocaleDateString("he-IL", { day: "numeric", month: "long" })} · ${count}`}
                    aria-label={`${key}: ${count} אירועים`}
                    className={cn(
                      "aspect-square rounded-[3px]",
                      HEAT_CLASS[step],
                      // Today gets a ring rather than a fill, so it stays
                      // legible whatever heat band it lands in.
                      isSameDay(day, today) && "ring-1 ring-[var(--gold)] ring-offset-1 ring-offset-[var(--surface)]"
                    )}
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="flex items-center gap-2 border-t border-hairline-card pt-3 text-[0.7rem] text-muted">
        <span>פחות</span>
        {HEAT_CLASS.map((cls, i) => (
          <span key={i} className={cn("size-3 rounded-[3px]", cls)} aria-hidden />
        ))}
        <span>יותר</span>
        {peak > 0 && <span className="ltr ms-auto tabular-nums">שיא: {peak} ביום</span>}
      </div>
    </div>
  );
}
