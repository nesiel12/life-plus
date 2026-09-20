"use client";

import { useMemo } from "react";
import { CalendarClock, MoonStar } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { useInsights } from "@/hooks/useInsights";
import { bedtimeInfo, durationLabel, tomorrowOutlook } from "@/lib/dashboard/contextData";
import type { WeekCalendarEvent } from "@/lib/time/buildDailyTimeline";
import { ContextCardShell } from "@/components/features/dashboard/context/ContextCardShell";

// Deliberately generic: these are the ordinary wind-down basics, offered as
// suggestions. The app does not know what helps this person sleep, and
// pretending otherwise would be the wrong kind of personal.
const WIND_DOWN = ["להנמיך מסכים ותאורה", "כוס מים אחרונה", "להכין מראש את מחר"];

/** הכנה לשינה — a countdown to the sleep time the person gave, and three quiet suggestions. */
export function SleepCard({ now }: { now: Date }) {
  const chronotype = useAtlasStore((s) => s.personalDNA.chronotype);
  const info = useMemo(
    () => bedtimeInfo(now, chronotype.sleepTime, chronotype.wakeTime),
    [now, chronotype.sleepTime, chronotype.wakeTime]
  );

  return (
    <ContextCardShell icon={MoonStar} title="הכנה לשינה" iconClass="text-accent-knowledge">
      <p className="text-sm leading-relaxed text-foreground/90">
        {info.pastBedtime
          ? `עברה שעת השינה (${info.sleepLabel}). אפשר לסיים ולנוח.`
          : `עוד ${durationLabel(info.minutesUntil ?? 0)} לשעת השינה (${info.sleepLabel}).`}
      </p>
      <ul className="flex flex-col gap-1 text-xs text-muted">
        {WIND_DOWN.map((tip) => (
          <li key={tip}>• {tip}</li>
        ))}
      </ul>
    </ContextCardShell>
  );
}

interface WeekResponse {
  connected: boolean;
  events: WeekCalendarEvent[];
}

const WEEK_FALLBACK: WeekResponse = { connected: false, events: [] };

/** מחר — what tomorrow holds, from the same sources as "today's structure". */
export function TomorrowCard({ now }: { now: Date }) {
  const tasks = useAtlasStore((s) => s.tasks);
  const manualEvents = useAtlasStore((s) => s.manualEvents);
  const transactions = useAtlasStore((s) => s.transactions);
  const meals = useAtlasStore((s) => s.meals);
  const workouts = useAtlasStore((s) => s.workouts);
  const { data } = useInsights<WeekResponse>("/api/calendar/week", WEEK_FALLBACK);

  const outlook = useMemo(
    () =>
      tomorrowOutlook({
        now,
        events: data?.events ?? [],
        tasks,
        manualEvents,
        transactions,
        meals,
        workouts,
      }),
    [now, data, tasks, manualEvents, transactions, meals, workouts]
  );

  return (
    <ContextCardShell icon={CalendarClock} title="מחר" iconClass="text-accent-time" href="/calendar" cta="ליומן">
      {outlook.count === 0 ? (
        <p className="text-sm text-muted">מחר פנוי כרגע — בלי אירועים מתוזמנים.</p>
      ) : (
        <>
          <p className="text-xs text-muted">
            {outlook.count === 1 ? "פריט אחד" : `${outlook.count} פריטים`} מתוזמנים
            {outlook.tasksDue > 0 ? ` · ${outlook.tasksDue} משימות לסיום` : ""}
          </p>
          <ul className="flex flex-col gap-1.5">
            {outlook.items.map((item, i) => (
              <li key={`${item.title}-${i}`} className="flex min-w-0 items-center gap-2 text-sm">
                {item.time && <span className="ltr shrink-0 text-xs text-muted">{item.time}</span>}
                <span className="min-w-0 flex-1 truncate text-foreground/90">{item.title}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </ContextCardShell>
  );
}
