"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CalendarPlus, Check, Dumbbell, Footprints, Loader2, Salad, Sparkles } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { useInsights } from "@/hooks/useInsights";
import { freeWindows, formatMinute } from "@/lib/schedule/routine";
import type { WeekCalendarEvent } from "@/lib/time/buildDailyTimeline";
import type { HealthCoachResult } from "@/app/api/ai/health-coach/route";
import { cn } from "@/lib/utils";

function localNow(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function toDateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const KIND_ICON = {
  workout: Dumbbell,
  walk: Footprints,
  stretch: Footprints,
  "meal-prep": Salad,
  rest: Sparkles,
  hydration: Sparkles,
} as const;

// The instant, proactive AI coach. Fetches the moment the Health page mounts —
// no button. Reads today's meals + workouts, works out the day's free windows
// from the routine skeleton and today's calendar, and asks the coach for one
// recommendation plus one concrete activity the user can drop into Google
// Calendar with a single tap.
export function InstantHealthCoach() {
  const meals = useAtlasStore((s) => s.meals);
  const workouts = useAtlasStore((s) => s.workouts);
  const routineBlocks = useAtlasStore((s) => s.routineBlocks);

  const { data: weekCal } = useInsights<{ connected: boolean; events: WeekCalendarEvent[] }>(
    "/api/calendar/week",
    { connected: false, events: [] }
  );

  const todayKey = useMemo(() => toDateKey(new Date()), []);

  // Free windows = the routine's free stretches for this weekday, minus
  // today's real calendar events, from now onward.
  const freeWindowPayload = useMemo(() => {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const weekday = now.getDay();

    const calBusy = (weekCal?.events ?? [])
      .filter((e) => !e.is_all_day && e.start_time.slice(0, 10) === todayKey)
      .map((e) => {
        const s = new Date(e.start_time);
        const en = new Date(e.end_time);
        return { startMinute: s.getHours() * 60 + s.getMinutes(), endMinute: en.getHours() * 60 + en.getMinutes() };
      });

    // freeWindows() only knows routine blocks; fold the calendar in as extra
    // "busy" by passing them as synthetic non-free blocks.
    const windows = freeWindows(
      [
        ...routineBlocks,
        ...calBusy.map((c, i) => ({
          id: `cal-${i}`,
          title: "",
          kind: "other" as const,
          weekdays: [weekday],
          startMinute: c.startMinute,
          endMinute: c.endMinute,
          isActive: true,
        })),
      ],
      weekday,
      { fromMinute: Math.max(nowMin, 6 * 60), toMinute: 23 * 60, minDurationMinutes: 30 }
    );

    return windows.slice(0, 6).map((w) => ({
      start: `${todayKey}T${formatMinute(w.startMinute)}`,
      end: `${todayKey}T${formatMinute(w.endMinute)}`,
      durationMinutes: w.durationMinutes,
    }));
  }, [routineBlocks, weekCal, todayKey]);

  const [result, setResult] = useState<HealthCoachResult | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable" | "error">("loading");
  const requested = useRef(false);

  useEffect(() => {
    // One fetch per mount, once the calendar has had a chance to resolve.
    if (requested.current) return;
    requested.current = true;

    const meta = {
      nowLocal: localNow(),
      meals: meals
        .filter((m) => m.eatenAt.slice(0, 10) === todayKey)
        .map((m) => ({
          description: m.description,
          type: m.type,
          time: new Date(m.eatenAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
        })),
      workouts: workouts
        .filter((w) => w.startTime.slice(0, 10) === todayKey)
        .map((w) => ({
          title: w.title,
          time: new Date(w.startTime).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
          details: w.routineDetails,
        })),
      freeWindows: freeWindowPayload,
    };

    fetch("/api/ai/health-coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(meta),
    })
      .then(async (res) => {
        if (res.status === 503) {
          setState("unavailable");
          return;
        }
        const data = await res.json();
        if (!res.ok) {
          setState("error");
          return;
        }
        setResult(data as HealthCoachResult);
        setState("ready");
      })
      .catch(() => setState("error"));
    // freeWindowPayload is derived and stable enough for a once-per-mount call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  async function addToCalendar() {
    const a = result?.suggested_activity;
    if (!a || adding) return;
    setAdding(true);
    setAddError(null);
    try {
      const start = new Date(`${a.start_local}:00`);
      const end = new Date(start.getTime() + a.duration_minutes * 60_000);
      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: a.title, start: start.toISOString(), end: end.toISOString() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setAddError(d?.error ?? "לא הצלחנו להוסיף ליומן.");
        return;
      }
      setAdded(true);
    } catch {
      setAddError("אין חיבור לשרת.");
    } finally {
      setAdding(false);
    }
  }

  if (state === "unavailable" || state === "error") return null;

  if (state === "loading") {
    return (
      <div className="flex items-center gap-3 py-2">
        <motion.div
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.6, repeat: Infinity }}
          className="flex size-9 items-center justify-center rounded-full bg-accent-fitness/10"
        >
          <Salad size={16} className="text-accent-fitness" aria-hidden />
        </motion.div>
        <p className="text-sm text-muted">המאמן קורא את היום שלך…</p>
      </div>
    );
  }

  if (!result) return null;
  const activity = result.suggested_activity;
  const ActIcon = activity ? KIND_ICON[activity.kind] : Sparkles;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col gap-3"
    >
      <p className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Salad size={15} className="text-accent-fitness" aria-hidden />
        המאמן שלך
      </p>

      <p className="text-sm font-medium text-foreground">{result.headline}</p>
      <p className="text-sm leading-relaxed text-foreground/80">{result.guidance}</p>

      {activity && (
        <div className="flex flex-col gap-2 rounded-xl border border-gold-line bg-gold-soft/40 p-3">
          <div className="flex items-center gap-2">
            <ActIcon size={15} className="shrink-0 text-gold-ink" aria-hidden />
            <span className="text-sm font-medium text-foreground">
              {activity.title} · <span className="ltr tabular-nums">{activity.start_local.slice(11)}</span> ·{" "}
              {activity.duration_minutes} דק׳
            </span>
          </div>
          <p className="text-xs text-foreground/75">{activity.why}</p>
          <button
            onClick={addToCalendar}
            disabled={adding || added}
            className={cn(
              "focus-ring mt-0.5 flex w-fit items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity disabled:opacity-60",
              added ? "bg-accent-health/20 text-accent-health" : "bg-ink text-[var(--background)] hover:opacity-90"
            )}
          >
            {added ? (
              <>
                <Check size={12} aria-hidden />
                נוסף ליומן
              </>
            ) : adding ? (
              <>
                <Loader2 size={12} className="animate-spin" aria-hidden />
                מוסיף…
              </>
            ) : (
              <>
                <CalendarPlus size={12} aria-hidden />
                הוסף ליומן החכם
              </>
            )}
          </button>
          {addError && <p className="text-xs text-accent-family">{addError}</p>}
        </div>
      )}
    </motion.div>
  );
}
