"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Activity, Check, Dumbbell, HeartPulse, Loader2, Pause, Play, Plus, Square, Timer, X } from "lucide-react";
import {
  EXERCISES,
  INTENSITY_LABELS,
  QUICK_WORKOUTS,
  WORKOUT_KINDS,
  elapsedMs,
  estimateCaloriesBurned,
  formatClock,
  heartRateZone,
  pauseTimer,
  readTimer,
  resumeTimer,
  routineSummary,
  startTimer,
  weekSummary,
  type TimerState,
} from "@/lib/health/workout";
import { cn } from "@/lib/utils";
import type { NewWorkoutInput } from "@/app/actions/health";
import type { Workout, WorkoutKind } from "@/types";

const STORAGE_KEY = "lifeplus.workout.active";

interface ActiveSession {
  timer: TimerState;
  kind: WorkoutKind;
  intensity: number;
  heartRate: number | null;
  sets: Record<string, number>;
}

function loadSession(): ActiveSession | null {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    const timer = readTimer(raw?.timer);
    if (!timer) return null;
    return {
      timer,
      kind: WORKOUT_KINDS.some((k) => k.kind === raw.kind) ? raw.kind : "other",
      intensity: Math.min(5, Math.max(1, Number(raw.intensity) || 3)),
      heartRate: typeof raw.heartRate === "number" ? raw.heartRate : null,
      sets: raw.sets && typeof raw.sets === "object" ? raw.sets : {},
    };
  } catch {
    return null;
  }
}

function saveSession(session: ActiveSession | null) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the session simply does not survive a reload.
  }
}

interface WorkoutHubProps {
  workouts: Workout[];
  onLog: (workout: NewWorkoutInput) => Promise<void>;
}

/**
 * The workout hub: a live timer with exercise cards, intensity and heart-rate
 * tracking, and 1-tap logging for the sessions most people repeat.
 *
 * A running session is kept in localStorage, so a reload, a closed tab or a
 * phone locking mid-set never loses it — the clock is derived from the start
 * time, not counted in memory.
 */
export function WorkoutHub({ workouts, onLog }: WorkoutHubProps) {
  const reduceMotion = useReducedMotion();
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [kind, setKind] = useState<WorkoutKind>("strength");
  const [intensity, setIntensity] = useState(3);
  const [now, setNow] = useState(() => Date.now());
  const [saving, setSaving] = useState<string | null>(null);
  const [logged, setLogged] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Restore once, then persist every change. Persisting from an effect (not
  // from each handler) means the stored session is always the LATEST state,
  // however fast the taps arrive; `restored` keeps the first render's empty
  // state from wiping a saved session before it has been read.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    setSession(loadSession());
    setRestored(true);
  }, []);
  useEffect(() => {
    if (restored) saveSession(session);
  }, [session, restored]);

  const running = session !== null && session.timer.pausedAt === null;
  useEffect(() => {
    if (!running) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [running]);

  /**
   * Changes the running session from ITS LATEST state. Handlers must not build
   * the next session from the render's `session`: two taps in quick succession
   * would both start from the same stale copy and the second would undo the first.
   */
  const patch = useCallback((change: (current: ActiveSession) => Partial<ActiveSession>) => {
    setSession((current) => (current ? { ...current, ...change(current) } : current));
  }, []);

  const week = useMemo(() => weekSummary(workouts, new Date()), [workouts]);
  const elapsed = session ? elapsedMs(session.timer, now) : 0;
  const minutes = Math.round(elapsed / 60_000);
  const zone = session?.heartRate ? heartRateZone(session.heartRate) : null;
  const liveCalories = session ? estimateCaloriesBurned(session.kind, session.intensity, elapsed / 60_000) : 0;

  function start() {
    const t = Date.now();
    setNow(t);
    setSession({ timer: startTimer(t), kind, intensity, heartRate: null, sets: {} });
  }

  async function finish() {
    if (!session) return;
    const end = Date.now();
    const length = elapsedMs(session.timer, end);
    if (length < 60_000) {
      setSession(null);
      return;
    }
    setSaving("session");
    setError(null);
    const label = WORKOUT_KINDS.find((k) => k.kind === session.kind)?.label ?? "אימון";
    try {
      await onLog({
        title: label,
        kind: session.kind,
        startTime: new Date(end - length).toISOString(),
        endTime: new Date(end).toISOString(),
        intensity: session.intensity,
        avgHeartRate: session.heartRate ?? undefined,
        caloriesBurned: estimateCaloriesBurned(session.kind, session.intensity, length / 60_000),
        routineDetails: routineSummary(session.sets) || undefined,
      });
      setSession(null);
      setLogged("session");
    } catch {
      setError("שמירת האימון נכשלה. האימון עדיין פתוח — נסה שוב.");
    } finally {
      setSaving(null);
    }
  }

  async function quickLog(id: string) {
    const preset = QUICK_WORKOUTS.find((q) => q.id === id);
    if (!preset) return;
    setSaving(id);
    setError(null);
    const end = Date.now();
    try {
      await onLog({
        title: preset.title,
        kind: preset.kind,
        startTime: new Date(end - preset.minutes * 60_000).toISOString(),
        endTime: new Date(end).toISOString(),
        intensity: preset.intensity,
        caloriesBurned: estimateCaloriesBurned(preset.kind, preset.intensity, preset.minutes),
      });
      setLogged(id);
      window.setTimeout(() => setLogged((current) => (current === id ? null : current)), 2200);
    } catch {
      setError("הרישום נכשל. נסה שוב.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="glass-card flex h-full flex-col gap-5 rounded-3xl p-5" aria-labelledby="workout-hub-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="workout-hub-title" className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Dumbbell size={17} className="text-accent-fitness" aria-hidden />
            אימונים
          </h2>
          <p className="text-xs text-muted">
            השבוע: {week.sessions} אימונים · {week.minutes} דק׳ · כ-{week.calories.toLocaleString("he-IL")} קק״ל
          </p>
        </div>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        {session ? (
          <motion.div
            key="live"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col gap-4"
          >
            {/* The clock. */}
            <div className="flex flex-wrap items-center gap-5">
              <div className="relative grid size-32 shrink-0 place-items-center">
                {running && !reduceMotion && (
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 rounded-full border-2 border-accent-fitness/40"
                    animate={{ scale: [1, 1.12], opacity: [0.6, 0] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                  />
                )}
                <div className="grid size-32 place-items-center rounded-full bg-accent-fitness/10 ring-1 ring-accent-fitness/30">
                  <div className="text-center">
                    <p className="ltr text-2xl font-semibold tabular-nums text-foreground" aria-live="off">
                      {formatClock(elapsed)}
                    </p>
                    <p className="text-[0.65rem] text-muted">{running ? "באימון" : "מושהה"}</p>
                  </div>
                </div>
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <p className="text-sm font-medium text-foreground">
                  {WORKOUT_KINDS.find((k) => k.kind === session.kind)?.emoji}{" "}
                  {WORKOUT_KINDS.find((k) => k.kind === session.kind)?.label}
                  <span className="ms-2 text-xs font-normal text-muted">כ-{liveCalories} קק״ל (הערכה)</span>
                </p>
                <IntensityPicker value={session.intensity} onChange={(value) => patch(() => ({ intensity: value }))} />
                <HeartRateInput
                  value={session.heartRate}
                  zoneLabel={zone?.label}
                  zone={zone?.zone}
                  onChange={(bpm) => patch(() => ({ heartRate: bpm }))}
                />
              </div>
            </div>

            {/* Exercise cards. */}
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {EXERCISES[session.kind].map((exercise, i) => {
                const count = session.sets[exercise] ?? 0;
                return (
                  <motion.li
                    key={exercise}
                    initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: reduceMotion ? 0 : i * 0.04 }}
                  >
                    <button
                      type="button"
                      onClick={() => patch((current) => ({ sets: { ...current.sets, [exercise]: (current.sets[exercise] ?? 0) + 1 } }))}
                      className={cn(
                        "focus-ring group flex w-full items-center justify-between gap-2 rounded-2xl border px-3 py-2.5 text-start transition-[border-color,box-shadow,background-color]",
                        count > 0
                          ? "border-accent-fitness/40 bg-accent-fitness/8"
                          : "border-hairline-card bg-surface hover:border-accent-fitness/40 hover:shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent-fitness)_10%,transparent)]"
                      )}
                      aria-label={`${exercise}: ${count} סטים. הוסף סט`}
                    >
                      <span className="truncate text-xs font-medium text-foreground">{exercise}</span>
                      <motion.span
                        key={count}
                        initial={reduceMotion || count === 0 ? false : { scale: 1.5 }}
                        animate={{ scale: 1 }}
                        className={cn(
                          "grid size-6 shrink-0 place-items-center rounded-full text-[0.7rem] font-semibold tabular-nums",
                          count > 0 ? "bg-accent-fitness text-white" : "bg-fill-subtle text-muted"
                        )}
                      >
                        {count > 0 ? count : <Plus size={11} aria-hidden />}
                      </motion.span>
                    </button>
                  </motion.li>
                );
              })}
            </ul>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  patch((current) => ({
                    timer: current.timer.pausedAt === null ? pauseTimer(current.timer, Date.now()) : resumeTimer(current.timer, Date.now()),
                  }))
                }
                className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-hairline-card bg-surface px-4 py-2 text-sm text-foreground/85 hover:border-accent-fitness/40"
              >
                {running ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
                {running ? "השהה" : "המשך"}
              </button>
              <button
                type="button"
                onClick={() => void finish()}
                disabled={saving === "session"}
                className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-accent-fitness px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {saving === "session" ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Square size={13} aria-hidden />}
                {minutes >= 1 ? "סיים ושמור" : "סיים"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("לבטל את האימון בלי לשמור?")) setSession(null);
                }}
                className="focus-ring inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs text-muted hover:text-accent-family"
              >
                <X size={13} aria-hidden />
                בטל
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col gap-4"
          >
            <div role="radiogroup" aria-label="סוג האימון" className="flex flex-wrap gap-1.5">
              {WORKOUT_KINDS.map((option) => (
                <button
                  key={option.kind}
                  type="button"
                  role="radio"
                  aria-checked={kind === option.kind}
                  onClick={() => setKind(option.kind)}
                  className={cn(
                    "focus-ring inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs transition-colors",
                    kind === option.kind
                      ? "border-accent-fitness/50 bg-accent-fitness/12 text-foreground"
                      : "border-hairline-card bg-surface text-foreground/80 hover:border-accent-fitness/40"
                  )}
                >
                  <span aria-hidden>{option.emoji}</span>
                  {option.label}
                </button>
              ))}
            </div>
            <IntensityPicker value={intensity} onChange={setIntensity} />
            <motion.button
              type="button"
              onClick={start}
              whileTap={reduceMotion ? undefined : { scale: 0.97 }}
              className="focus-ring inline-flex w-fit items-center gap-2 rounded-full bg-accent-fitness px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_-10px_var(--accent-fitness)]"
            >
              <Timer size={15} aria-hidden />
              התחל אימון
            </motion.button>

            <div className="border-t border-hairline-card pt-4">
              <p className="mb-2 text-xs font-medium text-muted">כבר התאמנת? רישום בלחיצה</p>
              <div className="flex flex-wrap gap-2">
                {QUICK_WORKOUTS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => void quickLog(preset.id)}
                    disabled={saving !== null}
                    className={cn(
                      "focus-ring inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors disabled:opacity-60",
                      logged === preset.id
                        ? "border-accent-health/50 bg-accent-health/12 text-accent-health"
                        : "border-hairline-card bg-surface text-foreground/85 hover:border-accent-fitness/40"
                    )}
                  >
                    {saving === preset.id ? (
                      <Loader2 size={12} className="animate-spin" aria-hidden />
                    ) : logged === preset.id ? (
                      <Check size={12} aria-hidden />
                    ) : (
                      <Activity size={12} aria-hidden />
                    )}
                    {preset.title} {preset.minutes} דק׳
                  </button>
                ))}
              </div>
            </div>
            {logged === "session" && (
              <p className="flex items-center gap-1.5 text-xs text-accent-health">
                <Check size={12} aria-hidden />
                האימון נשמר.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {error && <p className="text-xs text-accent-family">{error}</p>}
    </section>
  );
}

function IntensityPicker({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <div role="radiogroup" aria-label="עצימות" className="flex items-end gap-1">
        {[1, 2, 3, 4, 5].map((level) => (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={value === level}
            aria-label={INTENSITY_LABELS[level]}
            onClick={() => onChange(level)}
            className="focus-ring group grid h-8 w-4 items-end rounded"
          >
            <motion.span
              animate={{ height: 8 + level * 4.5 }}
              className={cn(
                "block w-full rounded-sm transition-colors",
                level <= value ? "bg-accent-fitness" : "bg-fill group-hover:bg-fill-strong"
              )}
            />
          </button>
        ))}
      </div>
      <span className="text-xs text-foreground/80">
        עצימות: <span className="font-medium">{INTENSITY_LABELS[value]}</span>
      </span>
    </div>
  );
}

function HeartRateInput({
  value,
  zone,
  zoneLabel,
  onChange,
}: {
  value: number | null;
  zone?: number;
  zoneLabel?: string;
  onChange: (bpm: number | null) => void;
}) {
  const reduceMotion = useReducedMotion();
  // The heart beats at the entered rate — the one place a number can be felt.
  const beat = value ? Math.max(0.3, 60 / value) : 1;
  return (
    <label className="flex items-center gap-2 text-xs text-foreground/80">
      <motion.span
        aria-hidden
        animate={value && !reduceMotion ? { scale: [1, 1.22, 1] } : { scale: 1 }}
        transition={value && !reduceMotion ? { duration: beat, repeat: Infinity, ease: "easeInOut" } : undefined}
        className="grid size-7 place-items-center rounded-full bg-accent-family/12 text-accent-family"
      >
        <HeartPulse size={14} />
      </motion.span>
      דופק
      <input
        type="number"
        inputMode="numeric"
        min={30}
        max={230}
        value={value ?? ""}
        onChange={(e) => {
          const bpm = Number(e.target.value);
          onChange(e.target.value === "" || !Number.isFinite(bpm) ? null : Math.min(230, Math.max(30, Math.round(bpm))));
        }}
        placeholder="—"
        aria-label="דופק ממוצע"
        className="ltr w-16 rounded-lg border border-hairline-card bg-surface px-2 py-1 text-center tabular-nums outline-none focus:border-accent-family/50"
      />
      {zoneLabel && (
        <span className="rounded-full bg-accent-family/10 px-2 py-0.5 text-[0.65rem] text-accent-family">
          אזור {zone} · {zoneLabel}
        </span>
      )}
    </label>
  );
}
