// The focus timer's rules (components/features/learning/FocusTimer.tsx), pure
// and tested. Time is kept as an absolute end timestamp rather than a
// decrementing counter, so a throttled background tab (setInterval drifts to
// 1/s or worse) still shows the right time when it wakes.

export type PomodoroMode = "focus" | "break";

export const POMODORO_MINUTES: Record<PomodoroMode, number> = { focus: 25, break: 5 };

export function nextMode(mode: PomodoroMode): PomodoroMode {
  return mode === "focus" ? "break" : "focus";
}

export function remainingMs(endsAt: number, now: number): number {
  return Math.max(0, endsAt - now);
}

/** "mm:ss", rounding *up* so the display never reads 00:00 while time is left. */
export function formatClock(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** 0..1 of the session elapsed. */
export function sessionProgress(mode: PomodoroMode, remaining: number): number {
  const full = POMODORO_MINUTES[mode] * 60_000;
  return Math.min(1, Math.max(0, 1 - remaining / full));
}
