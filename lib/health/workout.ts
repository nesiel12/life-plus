// Workout arithmetic — kinds, calorie estimates, the live timer, heart-rate zones.
// Pure and client-safe.

import type { WorkoutKind } from "@/types";

export const WORKOUT_KINDS: { kind: WorkoutKind; label: string; emoji: string }[] = [
  { kind: "strength", label: "כוח", emoji: "🏋️" },
  { kind: "cardio", label: "ריצה / אירובי", emoji: "🏃" },
  { kind: "hiit", label: "אינטרוולים", emoji: "⚡" },
  { kind: "walk", label: "הליכה", emoji: "🚶" },
  { kind: "yoga", label: "יוגה / מתיחות", emoji: "🧘" },
  { kind: "sport", label: "ספורט קבוצתי", emoji: "⚽" },
  { kind: "other", label: "אחר", emoji: "✨" },
];

export const INTENSITY_LABELS: Record<number, string> = {
  1: "קל מאוד",
  2: "קל",
  3: "בינוני",
  4: "מאומץ",
  5: "מקסימלי",
};

// Metabolic equivalents at moderate effort (Compendium of Physical Activities,
// rounded). Intensity scales them: 1 → ×0.6 … 5 → ×1.4.
const MET: Record<WorkoutKind, number> = {
  strength: 5,
  cardio: 8,
  hiit: 8,
  walk: 3.5,
  yoga: 2.5,
  sport: 7,
  other: 4.5,
};

/** kcal ≈ MET × kg × hours. An estimate, labelled as one wherever it is shown. */
export function estimateCaloriesBurned(kind: WorkoutKind, intensity: number, minutes: number, weightKg = 70): number {
  const level = Math.min(5, Math.max(1, Math.round(intensity)));
  const factor = 0.6 + (level - 1) * 0.2;
  return Math.max(0, Math.round(MET[kind] * factor * weightKg * (Math.max(0, minutes) / 60)));
}

export interface QuickWorkout {
  id: string;
  kind: WorkoutKind;
  title: string;
  minutes: number;
  intensity: number;
}

/** 1-tap logging for the sessions most people repeat. */
export const QUICK_WORKOUTS: QuickWorkout[] = [
  { id: "walk-30", kind: "walk", title: "הליכה", minutes: 30, intensity: 2 },
  { id: "run-25", kind: "cardio", title: "ריצה", minutes: 25, intensity: 4 },
  { id: "strength-45", kind: "strength", title: "אימון כוח", minutes: 45, intensity: 3 },
  { id: "hiit-20", kind: "hiit", title: "אינטרוולים", minutes: 20, intensity: 5 },
  { id: "yoga-30", kind: "yoga", title: "יוגה", minutes: 30, intensity: 2 },
];

// ---------------------------------------------------------------------------
// Live timer — survives pauses and page reloads (the state is serialisable).
// ---------------------------------------------------------------------------

export interface TimerState {
  startedAt: number;
  /** Set while paused. */
  pausedAt: number | null;
  /** Total paused time before the current pause. */
  pausedMs: number;
}

export function startTimer(now: number): TimerState {
  return { startedAt: now, pausedAt: null, pausedMs: 0 };
}

export function pauseTimer(state: TimerState, now: number): TimerState {
  return state.pausedAt === null ? { ...state, pausedAt: now } : state;
}

export function resumeTimer(state: TimerState, now: number): TimerState {
  return state.pausedAt === null ? state : { ...state, pausedAt: null, pausedMs: state.pausedMs + (now - state.pausedAt) };
}

/** Active time only — paused stretches do not count. */
export function elapsedMs(state: TimerState, now: number): number {
  const end = state.pausedAt ?? now;
  return Math.max(0, end - state.startedAt - state.pausedMs);
}

/** "12:05" or "1:02:09". */
export function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Reads a stored timer defensively (localStorage can hold anything). */
export function readTimer(value: unknown): TimerState | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<TimerState>;
  if (typeof v.startedAt !== "number" || typeof v.pausedMs !== "number") return null;
  if (v.pausedAt !== null && typeof v.pausedAt !== "number") return null;
  return { startedAt: v.startedAt, pausedAt: v.pausedAt ?? null, pausedMs: v.pausedMs };
}

// ---------------------------------------------------------------------------
// Heart rate
// ---------------------------------------------------------------------------

export interface HeartZone {
  zone: 1 | 2 | 3 | 4 | 5;
  label: string;
  /** Share of max heart rate, for the gauge. */
  share: number;
}

const ZONE_LABELS = ["התאוששות", "שריפת שומן", "אירובי", "סף", "מקסימום"] as const;

/**
 * Zone from beats per minute, against the classic 220 − age maximum.
 * Age defaults to 35 when unknown; the zones are guidance, not diagnosis.
 */
export function heartRateZone(bpm: number, age = 35): HeartZone {
  const max = Math.max(120, 220 - age);
  const share = Math.min(1.1, Math.max(0, bpm / max));
  const zone = share < 0.6 ? 1 : share < 0.7 ? 2 : share < 0.8 ? 3 : share < 0.9 ? 4 : 5;
  return { zone: zone as HeartZone["zone"], label: ZONE_LABELS[zone - 1], share: Math.round(share * 100) / 100 };
}

/** Perceived-exertion intensity implied by a heart-rate zone. */
export function intensityFromZone(zone: HeartZone["zone"]): number {
  return zone;
}

// ---------------------------------------------------------------------------
// Exercise cards for the live session
// ---------------------------------------------------------------------------

/** A handful of staple movements per kind — the cards shown while the timer runs. */
export const EXERCISES: Record<WorkoutKind, string[]> = {
  strength: ["סקוואט", "לחיצת חזה", "חתירה", "לחיצת כתפיים", "מתח", "פלאנק"],
  cardio: ["חימום", "ריצה רציפה", "האצות", "שחרור"],
  hiit: ["ברפי", "ג׳אמפינג ג׳קס", "מטפסי הרים", "סקוואט קפיצה"],
  walk: ["הליכה מהירה", "עלייה", "מתיחות"],
  yoga: ["כלב מביט מטה", "לוחם", "תנוחת ילד", "נשימות"],
  sport: ["חימום", "משחק", "שחרור"],
  other: ["חימום", "עבודה עיקרית", "שחרור"],
};

/** "סקוואט ×3 · פלאנק ×2" — what gets stored as the workout's routine details. */
export function routineSummary(sets: Record<string, number>): string {
  return Object.entries(sets)
    .filter(([, count]) => count > 0)
    .map(([name, count]) => `${name} ×${count}`)
    .join(" · ");
}

export interface WeekSummary {
  sessions: number;
  minutes: number;
  calories: number;
}

/** The last seven days of training, for the hub's header. Calories fall back to an estimate. */
export function weekSummary(
  workouts: readonly {
    startTime: string;
    endTime?: string;
    kind?: WorkoutKind;
    intensity?: number;
    caloriesBurned?: number;
  }[],
  now: Date
): WeekSummary {
  const from = now.getTime() - 7 * 24 * 3_600_000;
  let sessions = 0;
  let minutes = 0;
  let calories = 0;
  for (const w of workouts) {
    const start = new Date(w.startTime).getTime();
    if (Number.isNaN(start) || start < from || start > now.getTime()) continue;
    const end = w.endTime ? new Date(w.endTime).getTime() : start + 45 * 60_000;
    const length = Math.max(0, Math.round((end - start) / 60_000));
    sessions++;
    minutes += length;
    calories += w.caloriesBurned ?? estimateCaloriesBurned(w.kind ?? "other", w.intensity ?? 3, length);
  }
  return { sessions, minutes, calories };
}
