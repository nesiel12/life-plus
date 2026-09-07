"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarPlus, Clock3, Coffee } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import {
  ROUTINE_KIND_COLOR_VAR,
  ROUTINE_KIND_LABELS,
  formatDuration,
  formatMinute,
  nowNext,
} from "@/lib/schedule/routine";
import { cn } from "@/lib/utils";

/** Re-derive on the minute: everything here is a countdown. */
const TICK_MS = 30_000;

/**
 * "What am I doing now, and what's next."
 *
 * The dashboard could already answer "what is ON today" — calendar events,
 * tasks, meals. It could not answer "where am I in my day", because nothing
 * described the shape of a normal day. That is what routine blocks are for,
 * and this is the surface that makes them worth having.
 *
 * Reads the browser's clock directly rather than the stored timezone: the
 * device already knows what time it is where the user is standing, and this
 * card is only ever rendered for the person holding it. The stored timezone
 * exists for the server, which has no browser to ask.
 */
export function NowNextCard() {
  const blocks = useAtlasStore((s) => s.routineBlocks);

  // Not initialised from `new Date()`: the server and the client would render
  // different minutes, and React would flag the mismatch. Null until mounted,
  // which also gives an honest skeleton on the first paint.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const state = useMemo(() => {
    if (!now) return null;
    const weekday = now.getDay();
    const minute = now.getHours() * 60 + now.getMinutes();
    return nowNext(blocks, weekday, minute, (weekday + 1) % 7);
  }, [blocks, now]);

  if (blocks.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2.5">
        <p className="flex items-center gap-2 text-sm font-medium text-muted">
          <Clock3 size={16} className="text-accent-time" aria-hidden />
          הלוז שלך
        </p>
        <p className="text-sm text-foreground">עוד לא הגדרת לוז שבועי.</p>
        <p className="text-xs text-muted">
          כשתגדיר את השלד של השבוע — מתי אתה עובד, לומד, מתאמן ונח — האפליקציה תדע להגיד לך מה עכשיו,
          מה הבא, ומתי אתה באמת פנוי.
        </p>
        <Link
          href="/areas/time"
          className="focus-ring glass-control mt-1 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-foreground"
        >
          <CalendarPlus size={13} aria-hidden />
          בנה את הלוז
        </Link>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="flex flex-col gap-3" aria-hidden>
        <div className="h-4 w-24 animate-pulse rounded bg-fill-subtle" />
        <div className="h-12 animate-pulse rounded-xl bg-fill-subtle" />
      </div>
    );
  }

  const { current, minutesRemaining, next, nextFreeWindow } = state;

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-sm font-medium text-muted">
        <Clock3 size={16} className="text-accent-time" aria-hidden />
        עכשיו
      </p>

      {current ? (
        <div
          className="rounded-xl border p-3.5"
          style={{
            borderColor: `color-mix(in srgb, var(${ROUTINE_KIND_COLOR_VAR[current.kind]}) 35%, transparent)`,
            background: `color-mix(in srgb, var(${ROUTINE_KIND_COLOR_VAR[current.kind]}) 8%, transparent)`,
          }}
        >
          <p className="text-base font-medium text-foreground">{current.title}</p>
          <p className="mt-0.5 text-xs text-muted">
            {ROUTINE_KIND_LABELS[current.kind]} · {formatMinute(current.startMinute)}–
            {formatMinute(current.endMinute)}
            {minutesRemaining !== null && ` · נשארו ${formatDuration(minutesRemaining)}`}
          </p>
          {current.note && <p className="mt-1.5 text-xs text-foreground/75">{current.note}</p>}
        </div>
      ) : (
        <div className="flex items-start gap-2.5 rounded-xl border border-hairline-card bg-surface-sunken/60 p-3.5">
          <Coffee size={16} className="mt-0.5 shrink-0 text-gold-ink" aria-hidden />
          <div>
            <p className="text-sm font-medium text-foreground">אין כלום בלוז כרגע</p>
            <p className="mt-0.5 text-xs text-muted">
              {next
                ? `פנוי עד ${formatMinute(next.block.startMinute)}.`
                : "שאר היום פנוי."}
            </p>
          </div>
        </div>
      )}

      {next && (
        <div className="flex items-center justify-between gap-3 border-t border-hairline-card pt-3">
          <div className="min-w-0">
            <p className="text-[0.7rem] uppercase tracking-wide text-muted">הבא</p>
            <p className="truncate text-sm text-foreground">{next.block.title}</p>
          </div>
          <div className="shrink-0 text-end">
            <p className="text-sm font-medium text-foreground">
              {formatMinute(next.block.startMinute)}
            </p>
            <p className="text-[0.7rem] text-muted">
              {next.isTomorrow ? "מחר" : `בעוד ${formatDuration(next.minutesUntil)}`}
            </p>
          </div>
        </div>
      )}

      {/* Only when it is actually usable — telling someone they have 30 free
          minutes starting four hours from now is not information they can act
          on, and a card that always shows something is a card nobody reads. */}
      {nextFreeWindow && nextFreeWindow.durationMinutes >= 45 && (
        <p className="text-xs text-muted">
          חלון פנוי: {formatMinute(nextFreeWindow.startMinute)}–
          {formatMinute(nextFreeWindow.endMinute)} ({formatDuration(nextFreeWindow.durationMinutes)})
        </p>
      )}

      <Link
        href="/areas/time"
        className={cn(
          "focus-ring flex items-center gap-1 self-start rounded-lg text-xs text-muted",
          "transition-colors hover:text-foreground"
        )}
      >
        הלוז המלא
        <ArrowLeft size={12} aria-hidden />
      </Link>
    </div>
  );
}
