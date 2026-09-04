"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, Loader2, Sparkles, TrendingUp } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { useInsights } from "@/hooks/useInsights";
import { analyzeMonth, type MonthEvent } from "@/lib/calendar/analyzeMonth";
import { cn } from "@/lib/utils";

interface MonthResponse {
  connected: boolean;
  month: string;
  events: (MonthEvent & { id: string })[];
}

const FALLBACK: MonthResponse = { connected: false, month: "", events: [] };

// Sunday-first, matching the Hebrew week and Date.getDay().
const WEEKDAY_INITIALS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("he-IL", { month: "long", year: "numeric" });
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className="ltr font-medium tabular-nums text-foreground">{value}</span>
    </div>
  );
}

// The month view (Sprint: Calendar Overhaul) — the whole current month at a
// glance, plus the time/lifestyle analysis derived from it.
//
// Every figure comes from lib/calendar/analyzeMonth.ts, which is pure and
// tested: no AI call is involved in producing a number here. The month grid
// and the analysis read the same fetched events, so the two can never
// disagree about what's on the calendar.
export function MonthView() {
  const chronotype = useAtlasStore((s) => s.personalDNA.chronotype);
  const [month] = useState(currentMonthKey);

  const { data } = useInsights<MonthResponse>(`/api/calendar/month?month=${month}`, FALLBACK, [month]);

  const events = useMemo(() => data?.events ?? [], [data]);
  const analysis = useMemo(() => analyzeMonth(month, events, chronotype), [month, events, chronotype]);

  // Day cells: a leading blank run for the first-of-month's weekday, then
  // every real day with its own event count.
  const cells = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const firstWeekday = new Date(y, m - 1, 1).getDay();
    const dayCount = new Date(y, m, 0).getDate();

    const countByDay = new Map<number, number>();
    for (const event of events) {
      const start = new Date(event.start);
      if (Number.isNaN(start.getTime())) continue;
      if (start.getFullYear() !== y || start.getMonth() !== m - 1) continue;
      countByDay.set(start.getDate(), (countByDay.get(start.getDate()) ?? 0) + 1);
    }

    const today = new Date();
    const isCurrentMonth = today.getFullYear() === y && today.getMonth() === m - 1;

    return [
      ...Array.from({ length: firstWeekday }, () => null),
      ...Array.from({ length: dayCount }, (_, i) => ({
        day: i + 1,
        count: countByDay.get(i + 1) ?? 0,
        isToday: isCurrentMonth && today.getDate() === i + 1,
      })),
    ];
  }, [month, events]);

  if (data === null) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <Loader2 size={14} className="animate-spin" aria-hidden />
        טוען את החודש…
      </p>
    );
  }

  if (!data.connected) {
    return <p className="text-sm text-muted">היומן לא מחובר, אז אין נתונים חודשיים להצגה.</p>;
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Month grid */}
      <div className="min-w-0 flex-1">
        <p className="mb-4 flex items-center gap-2 text-sm font-medium text-muted">
          <CalendarDays size={16} className="text-accent-time" aria-hidden />
          {monthLabel(month)}
        </p>

        <div className="grid grid-cols-7 gap-1.5" role="grid" aria-label={`אירועים ב${monthLabel(month)}`}>
          {WEEKDAY_INITIALS.map((initial, i) => (
            <div key={`h-${i}`} className="pb-1 text-center text-xs font-medium text-muted" role="columnheader">
              {initial}
            </div>
          ))}
          {cells.map((cell, i) =>
            cell === null ? (
              <div key={`blank-${i}`} aria-hidden />
            ) : (
              <motion.div
                key={cell.day}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, delay: Math.min(cell.day * 0.006, 0.2) }}
                role="gridcell"
                aria-label={`${cell.day} — ${cell.count} אירועים`}
                className={cn(
                  "flex aspect-square flex-col items-center justify-center rounded-lg border text-xs transition-colors",
                  cell.isToday
                    ? "border-gold-line bg-gold-soft text-gold-ink"
                    : cell.count > 0
                      ? "border-hairline-card bg-surface-sunken text-foreground"
                      : "border-transparent text-muted"
                )}
              >
                <span className="ltr tabular-nums">{cell.day}</span>
                {cell.count > 0 && (
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 h-1 rounded-full bg-accent-time",
                      // Width encodes load without needing a number in a
                      // cell this small.
                      cell.count >= 4 ? "w-5" : cell.count >= 2 ? "w-3" : "w-1.5"
                    )}
                  />
                )}
              </motion.div>
            )
          )}
        </div>
      </div>

      {/* Analysis */}
      <div className="flex w-full shrink-0 flex-col gap-4 lg:w-72">
        <p className="flex items-center gap-2 text-sm font-medium text-muted">
          <TrendingUp size={16} className="text-accent-learning" aria-hidden />
          ניתוח הזמן שלך
        </p>

        {analysis.eventCount === 0 ? (
          <p className="text-sm text-muted">אין אירועים החודש לנתח.</p>
        ) : (
          <div className="flex flex-col gap-2.5 rounded-xl border border-hairline-card bg-surface-sunken/60 p-4">
            <StatLine label="סה״כ אירועים" value={String(analysis.eventCount)} />
            <StatLine label="שעות מתוזמנות" value={`${analysis.totalHours}`} />
            <StatLine label="ימים פעילים" value={String(analysis.activeDays)} />
            <StatLine label="ממוצע ליום פעיל" value={`${analysis.averageHoursPerActiveDay} שע׳`} />
            {analysis.busiestDay && (
              <StatLine
                label="היום העמוס ביותר"
                value={`${new Date(analysis.busiestDay.date).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })} · ${analysis.busiestDay.hours} שע׳`}
              />
            )}
            {analysis.longestFreeStreakDays > 0 && (
              <StatLine label="הרצף הפנוי הארוך ביותר" value={`${analysis.longestFreeStreakDays} ימים`} />
            )}
          </div>
        )}

        {analysis.byDayPart.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted">איך הזמן מתחלק ביום</p>
            {analysis.byDayPart.map((part) => (
              <div key={part.part} className="flex items-center gap-2 text-xs">
                <span className="w-20 shrink-0 text-muted">{part.label}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-fill-subtle">
                  <span
                    className="block h-full rounded-full bg-[var(--gold)]"
                    style={{ width: `${Math.round(part.share * 100)}%` }}
                  />
                </span>
                <span className="ltr w-10 shrink-0 text-end tabular-nums text-muted">
                  {Math.round(part.share * 100)}%
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Only shown when a real chronotype exists — otherwise these would
            be a fabricated zero rather than an honest absence. */}
        {analysis.peakHours !== null && analysis.lowEnergyHours !== null && (
          <div className="flex flex-col gap-2.5 rounded-xl border border-hairline-card bg-surface-sunken/60 p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <Sparkles size={12} className="text-gold-ink" aria-hidden />
              מול שעות האנרגיה שלך
            </p>
            <StatLine label="בשעות השיא" value={`${analysis.peakHours} שע׳`} />
            <StatLine label="בשעות התשישות" value={`${analysis.lowEnergyHours} שע׳`} />
          </div>
        )}
      </div>
    </div>
  );
}
