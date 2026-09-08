"use client";

import { CalendarDays, Sparkles, Star } from "lucide-react";
import { useInsights } from "@/hooks/useInsights";
import type { HebrewCalendarResponse } from "@/app/api/hebrew-calendar/route";

const FALLBACK: HebrewCalendarResponse = {
  hebrewDate: "",
  hebrewDateGematriya: "",
  todayHolidays: [],
  upcoming: [],
};

function whenLabel(daysUntil: number): string {
  if (daysUntil === 1) return "מחר";
  if (daysUntil <= 7) return `בעוד ${daysUntil} ימים`;
  if (daysUntil <= 21) return `בעוד ${Math.round(daysUntil / 7)} שבועות`;
  const months = Math.round(daysUntil / 30);
  return months <= 1 ? "בעוד כחודש" : `בעוד כ-${months} חודשים`;
}

// The Jewish calendar at a glance: today's Hebrew date, anything falling
// today, and the next few festivals. Computed offline (@hebcal/core) — no
// external service, works the same on a plane.
export function HebrewCalendarCard() {
  const { data, loading } = useInsights<HebrewCalendarResponse>("/api/hebrew-calendar", FALLBACK);

  if (loading && !data?.hebrewDate) {
    return <div className="h-24 animate-pulse rounded-xl bg-fill-subtle" aria-hidden />;
  }

  const hebrewDate = data?.hebrewDateGematriya || data?.hebrewDate || "";
  const next = data?.upcoming[0];

  return (
    <div className="flex h-full flex-col">
      <p className="mb-3 flex items-center gap-2 text-sm font-medium text-muted">
        <CalendarDays size={16} className="text-accent-faith" aria-hidden />
        לוח עברי
      </p>

      <p className="text-lg font-semibold tracking-tight text-foreground">{hebrewDate}</p>

      {data && data.todayHolidays.length > 0 && (
        <p className="mt-1 flex items-center gap-1.5 text-sm text-gold-ink">
          <Sparkles size={13} aria-hidden />
          {data.todayHolidays.join(" · ")}
        </p>
      )}

      {data && data.upcoming.length > 0 && (
        <ul className="mt-3 flex flex-1 flex-col gap-2 border-t border-hairline-card pt-2.5">
          {data.upcoming.slice(0, 4).map((h) => (
            <li key={h.name} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-1.5">
                {h.major && <Star size={11} className="shrink-0 fill-gold-ink text-gold-ink" aria-hidden />}
                <span className="truncate text-foreground/90">{h.hebrewName}</span>
              </span>
              <span className="shrink-0 text-xs text-muted">{whenLabel(h.daysUntil)}</span>
            </li>
          ))}
        </ul>
      )}

      {data && data.upcoming.length === 0 && next === undefined && (
        <p className="mt-3 text-xs text-muted">אין חגים קרובים בטווח הנראה לעין.</p>
      )}
    </div>
  );
}
