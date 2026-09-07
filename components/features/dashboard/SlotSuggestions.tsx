"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarPlus, Check, Clock3, Loader2, X } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { formatMinute } from "@/lib/schedule/routine";
import { suggestSlots, type SchedulableTask } from "@/lib/schedule/slotSuggestions";
import { dayPartToHours } from "@/lib/onboarding/chronotype";

/**
 * "You have 90 free minutes at 14:00 — put the overdue thing there."
 *
 * The app already knew both halves of this and never joined them: which
 * tasks are pressing (Time & Tasks) and when the day is actually free (the
 * routine blocks). This is the join.
 *
 * Accepting writes a real Google Calendar event, so the block exists
 * somewhere the user will actually see it — a suggestion that lives only in
 * this card is a suggestion that gets scrolled past.
 */
export function SlotSuggestions() {
  const tasks = useAtlasStore((s) => s.tasks);
  const blocks = useAtlasStore((s) => s.routineBlocks);
  const chronotype = useAtlasStore((s) => s.personalDNA.chronotype);

  const [now, setNow] = useState<Date | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [scheduled, setScheduled] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Null until mounted: the server and client would otherwise disagree about
  // the current minute and React would flag the mismatch.
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 5 * 60_000);
    return () => clearInterval(timer);
  }, []);

  const peakHours = useMemo(
    () => (chronotype.peakFocusHours ?? []).flatMap((part) => dayPartToHours(part)),
    [chronotype.peakFocusHours]
  );

  const suggestions = useMemo(() => {
    if (!now) return [];
    const schedulable: SchedulableTask[] = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      isHighPriority: t.isHighPriority ?? false,
      dueDate: t.dueDate,
      status: t.status,
    }));
    return suggestSlots(schedulable, blocks, {
      at: now,
      weekday: now.getDay(),
      nowMinute: now.getHours() * 60 + now.getMinutes(),
      todayKey: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
        now.getDate()
      ).padStart(2, "0")}`,
      peakHours,
    }).filter((s) => !dismissed.has(s.task.id) && !scheduled.has(s.task.id));
  }, [tasks, blocks, now, peakHours, dismissed, scheduled]);

  const schedule = useCallback(
    async (taskId: string, title: string, startMinute: number, endMinute: number) => {
      if (!now) return;
      setBusyId(taskId);
      setError(null);
      try {
        const toInstant = (minute: number) => {
          const d = new Date(now);
          d.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
          return d.toISOString();
        };
        const res = await fetch("/api/calendar/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            start: toInstant(startMinute),
            end: toInstant(endMinute),
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          setError(data?.error ?? "לא הצלחנו להוסיף ליומן.");
          return;
        }
        setScheduled((s) => new Set(s).add(taskId));
      } catch {
        setError("אין חיבור לשרת.");
      } finally {
        setBusyId(null);
      }
    },
    [now]
  );

  if (!now) {
    return <div className="h-16 animate-pulse rounded-xl bg-fill-subtle" aria-hidden />;
  }

  if (suggestions.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-muted">
          <Clock3 size={16} className="text-accent-time" aria-hidden />
          שיבוץ חכם
        </p>
        <p className="text-sm text-foreground">
          {blocks.length === 0
            ? "בנה לוז שבועי כדי שנוכל להציע לך מתי לעשות דברים."
            : "אין כרגע משימה דחופה שמחכה לחלון פנוי."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-sm font-medium text-muted">
        <Clock3 size={16} className="text-accent-time" aria-hidden />
        מתי לעשות את זה
      </p>

      <ul className="flex flex-col gap-2">
        {suggestions.map((suggestion) => (
          <li
            key={suggestion.task.id}
            className="flex flex-col gap-2 rounded-xl border border-hairline-card bg-surface-sunken/50 p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">{suggestion.task.title}</p>
                <p className="mt-0.5 text-xs text-muted">
                  <span className="ltr inline-block tabular-nums">
                    {formatMinute(suggestion.startMinute)}–{formatMinute(suggestion.endMinute)}
                  </span>
                  {" · "}
                  {suggestion.reason}
                </p>
              </div>
              <button
                onClick={() => setDismissed((d) => new Set(d).add(suggestion.task.id))}
                aria-label={`הסתר הצעה עבור ${suggestion.task.title}`}
                className="focus-ring grid size-6 shrink-0 place-items-center rounded-md text-muted transition-colors hover:text-foreground"
              >
                <X size={12} aria-hidden />
              </button>
            </div>

            <button
              onClick={() =>
                schedule(
                  suggestion.task.id,
                  suggestion.task.title,
                  suggestion.startMinute,
                  suggestion.endMinute
                )
              }
              disabled={busyId === suggestion.task.id}
              className="focus-ring flex w-fit items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-[var(--background)] disabled:opacity-50"
            >
              {busyId === suggestion.task.id ? (
                <Loader2 size={12} className="animate-spin" aria-hidden />
              ) : (
                <CalendarPlus size={12} aria-hidden />
              )}
              קבע ביומן
            </button>
          </li>
        ))}
      </ul>

      {scheduled.size > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-accent-health">
          <Check size={12} aria-hidden />
          נקבע ביומן
        </p>
      )}

      {error && (
        <p role="alert" className="text-xs text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
