"use client";

import { CalendarHeart } from "lucide-react";
import { useAtlasStore, categoryLabel } from "@/store/useAtlasStore";
import { daysUntil } from "@/lib/utils";

const MAX_UPCOMING_ON_DASHBOARD = 3;

/**
 * רגעים משמעותיים בקרוב — the next few upcoming calendar events. Extracted
 * from app/page.tsx's inline JSX (it used to be hand-written directly in the
 * dashboard's widget-content map) into its own component purely so it isn't
 * written out twice; no behavior change from the original inline version.
 */
export function UpcomingMomentsCard() {
  const upcomingEvents = useAtlasStore((s) => s.upcomingEvents);

  return (
    <>
      <p className="mb-5 flex items-center gap-2 text-sm font-medium text-muted">
        <CalendarHeart size={16} className="text-accent-family" aria-hidden />
        רגעים משמעותיים בקרוב
      </p>
      {upcomingEvents.length === 0 ? (
        <p className="text-xs text-muted">אין כרגע רגעים מתוזמנים.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {upcomingEvents.slice(0, MAX_UPCOMING_ON_DASHBOARD).map((event) => {
            const diff = daysUntil(event.date);
            const label = diff === 0 ? "היום" : diff === 1 ? "מחר" : diff > 1 ? `בעוד ${diff} ימים` : "עבר";
            return (
              <li
                key={event.id}
                className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-hairline-card bg-surface-sunken/60 px-3.5 py-2.5 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2 text-foreground/90">
                  <CalendarHeart size={15} className="shrink-0 text-accent-family" aria-hidden />
                  <span className="truncate">{event.title}</span>
                  <span className="shrink-0 text-xs text-muted">· {categoryLabel(event.category)}</span>
                </span>
                <span className="ltr shrink-0 whitespace-nowrap text-xs text-muted">{label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
