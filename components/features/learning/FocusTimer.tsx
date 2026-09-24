"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Volume2 } from "lucide-react";
import { useLab } from "@/components/features/learning/lab/LabContext";
import { POMODORO_MINUTES, formatClock, nextMode, remainingMs, sessionProgress, type PomodoroMode } from "@/lib/learning/pomodoro";
import { AMBIENT_LABEL, startAmbient, type AmbientHandle, type AmbientKind } from "@/lib/sound/ambient";
import { cn } from "@/lib/utils";

const AMBIENTS: (AmbientKind | null)[] = [null, "brown", "rain", "waves"];

/**
 * A Pomodoro timer (25/5) with synthesized ambient sound — the topic canvas's
 * "focus mode". Loaded on demand (next/dynamic) the first time it is opened.
 *
 * Accessibility: the clock is role="timer" (not announced every second), the
 * bar is a real progressbar, and the one announcement that matters — a
 * session ending — goes through a polite live region.
 */
export default function FocusTimer() {
  const lab = useLab();
  const [mode, setMode] = useState<PomodoroMode>("focus");
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [pausedRemaining, setPausedRemaining] = useState<number>(POMODORO_MINUTES.focus * 60_000);
  const [now, setNow] = useState(() => Date.now());
  const [announcement, setAnnouncement] = useState("");
  const [ambient, setAmbient] = useState<AmbientKind | null>(null);
  const [volume, setVolume] = useState(0.35);
  const ambientRef = useRef<AmbientHandle | null>(null);

  const running = endsAt !== null;
  const remaining = running ? remainingMs(endsAt, now) : pausedRemaining;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [running]);

  // A session ran out: chime, announce, and queue up the next one (paused —
  // starting a break or a new focus block is the learner's choice).
  useEffect(() => {
    if (!running || remaining > 0) return;
    const next = nextMode(mode);
    lab.audio.play("chime");
    setAnnouncement(mode === "focus" ? "סיימת סשן ריכוז. זמן להפסקה קצרה." : "ההפסקה נגמרה. מוכנ/ה לסשן הבא?");
    setMode(next);
    setEndsAt(null);
    setPausedRemaining(POMODORO_MINUTES[next] * 60_000);
  }, [running, remaining, mode, lab.audio]);

  const toggle = useCallback(() => {
    if (running) {
      setPausedRemaining(remainingMs(endsAt!, Date.now()));
      setEndsAt(null);
    } else {
      lab.audio.prime();
      const t = Date.now();
      setNow(t);
      setEndsAt(t + pausedRemaining);
    }
  }, [running, endsAt, pausedRemaining, lab.audio]);

  const reset = useCallback(() => {
    setEndsAt(null);
    setPausedRemaining(POMODORO_MINUTES[mode] * 60_000);
  }, [mode]);

  const switchMode = useCallback((m: PomodoroMode) => {
    setMode(m);
    setEndsAt(null);
    setPausedRemaining(POMODORO_MINUTES[m] * 60_000);
  }, []);

  const chooseAmbient = useCallback(
    (kind: AmbientKind | null) => {
      ambientRef.current?.stop();
      ambientRef.current = kind ? startAmbient(kind, volume) : null;
      setAmbient(kind);
    },
    [volume]
  );

  useEffect(() => () => ambientRef.current?.stop(), []);

  const progress = sessionProgress(mode, remaining);

  return (
    <div className="flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-4 p-4">
      <div role="radiogroup" aria-label="סוג סשן" className="grid grid-cols-2 gap-1 rounded-xl bg-fill-subtle p-1">
        {(["focus", "break"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => switchMode(m)}
            className={cn("focus-ring min-h-11 rounded-lg text-sm font-medium transition-colors", mode === m ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground")}
          >
            {m === "focus" ? `ריכוז ${POMODORO_MINUTES.focus}′` : `הפסקה ${POMODORO_MINUTES.break}′`}
          </button>
        ))}
      </div>

      <div className="flex flex-col items-center gap-2">
        <span role="timer" aria-label={`נותרו ${formatClock(remaining)}`} className="ltr text-5xl font-bold tabular-nums text-foreground">
          {formatClock(remaining)}
        </span>
        <div
          role="progressbar"
          aria-label="התקדמות הסשן"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          className="h-1.5 w-full overflow-hidden rounded-full bg-fill-subtle"
        >
          {/* scaleX, not width: the bar moves every 250ms and must not relayout. */}
          <div className="h-full w-full origin-right rounded-full bg-accent-learning transition-transform duration-300" style={{ transform: `scaleX(${progress})` }} />
        </div>
      </div>

      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={toggle}
          className="focus-ring flex min-h-11 items-center gap-1.5 rounded-xl bg-accent-learning px-5 text-sm font-semibold text-background"
        >
          {running ? <Pause size={15} aria-hidden /> : <Play size={15} aria-hidden />}
          {running ? "השהה" : "התחל"}
        </button>
        <button type="button" onClick={reset} aria-label="אפס טיימר" className="focus-ring grid size-11 place-items-center rounded-xl bg-fill-subtle text-muted hover:text-foreground">
          <RotateCcw size={15} aria-hidden />
        </button>
      </div>

      <div className="flex flex-col gap-2 border-t border-hairline-card pt-3">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
          <Volume2 size={12} aria-hidden />
          צליל רקע
        </span>
        <div role="radiogroup" aria-label="צליל רקע" className="flex flex-wrap gap-1.5">
          {AMBIENTS.map((kind) => (
            <button
              key={kind ?? "none"}
              type="button"
              role="radio"
              aria-checked={ambient === kind}
              onClick={() => chooseAmbient(kind)}
              className={cn(
                "focus-ring min-h-11 rounded-full px-3 text-xs font-medium transition-colors",
                ambient === kind ? "bg-accent-learning text-background" : "bg-fill-subtle text-foreground hover:bg-accent-learning/15"
              )}
            >
              {kind ? AMBIENT_LABEL[kind] : "שקט"}
            </button>
          ))}
        </div>
        {ambient && (
          <label className="flex items-center gap-2 text-xs text-muted">
            עוצמה
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => {
                const v = Number(e.target.value);
                setVolume(v);
                ambientRef.current?.setVolume(v);
              }}
              className="min-h-11 flex-1 accent-[var(--accent-learning)]"
            />
          </label>
        )}
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
