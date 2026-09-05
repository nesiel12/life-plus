// Focus Mode session maths.
//
// Pure, so the timer's behaviour is testable without mounting a component or
// mocking the clock — every function takes `now` rather than reading it.
// This is the same discipline findFocusSlots and groundTasks already follow.

export const DEFAULT_FOCUS_MINUTES = 25;
export const DEFAULT_BREAK_MINUTES = 5;

export interface FocusSession {
  /** What is being worked on. Null for an untethered session. */
  taskId: string | null;
  taskTitle: string | null;
  /** Epoch ms. */
  startedAt: number;
  durationMinutes: number;
  /** Accumulated paused time, so a pause doesn't eat the session. */
  pausedMs: number;
  /** Epoch ms when the current pause began; null while running. */
  pausedAt: number | null;
}

export interface FocusProgress {
  elapsedMs: number;
  remainingMs: number;
  /** 0-1, clamped. */
  fraction: number;
  isComplete: boolean;
  isPaused: boolean;
  /** "MM:SS" of the time left. */
  display: string;
}

export function startSession(params: {
  taskId?: string | null;
  taskTitle?: string | null;
  durationMinutes?: number;
  now: number;
}): FocusSession {
  return {
    taskId: params.taskId ?? null,
    taskTitle: params.taskTitle ?? null,
    startedAt: params.now,
    durationMinutes: params.durationMinutes ?? DEFAULT_FOCUS_MINUTES,
    pausedMs: 0,
    pausedAt: null,
  };
}

export function pause(session: FocusSession, now: number): FocusSession {
  if (session.pausedAt !== null) return session;
  return { ...session, pausedAt: now };
}

export function resume(session: FocusSession, now: number): FocusSession {
  if (session.pausedAt === null) return session;
  // Fold the pause into the accumulated total rather than shifting
  // startedAt — keeping the original start makes "when did I begin?"
  // answerable, which a moving start time would destroy.
  return { ...session, pausedMs: session.pausedMs + (now - session.pausedAt), pausedAt: null };
}

function pad(n: number): string {
  return String(Math.floor(n)).padStart(2, "0");
}

export function formatRemaining(remainingMs: number): string {
  const total = Math.max(0, Math.ceil(remainingMs / 1000));
  return `${pad(total / 60)}:${pad(total % 60)}`;
}

export function progressOf(session: FocusSession, now: number): FocusProgress {
  const totalMs = session.durationMinutes * 60_000;
  // Time spent inside the current pause counts as paused too, or the timer
  // would keep running on screen while "paused".
  const currentPause = session.pausedAt !== null ? now - session.pausedAt : 0;
  const elapsedMs = Math.max(0, now - session.startedAt - session.pausedMs - currentPause);
  const remainingMs = Math.max(0, totalMs - elapsedMs);

  return {
    elapsedMs,
    remainingMs,
    fraction: totalMs > 0 ? Math.min(1, elapsedMs / totalMs) : 0,
    isComplete: remainingMs === 0,
    isPaused: session.pausedAt !== null,
    display: formatRemaining(remainingMs),
  };
}
