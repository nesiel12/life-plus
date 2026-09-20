// Hydration arithmetic for the water tracker. Pure and client-safe.

/** One tap of the quick button: a standard glass. */
export const WATER_STEP_ML = 250;

export interface WaterLog {
  id: string;
  amountMl: number;
  loggedAt: string;
}

/** Total of the logs at or after `dayStart` (the learner's own local midnight). */
export function waterTotal(logs: readonly WaterLog[], dayStart: Date): number {
  const from = dayStart.getTime();
  return logs.reduce((sum, log) => (new Date(log.loggedAt).getTime() >= from ? sum + log.amountMl : sum), 0);
}

/** 0..1 for the glass's fill. Capped: an over-full glass is drawn full, not overflowing. */
export function waterFraction(totalMl: number, targetMl: number): number {
  if (targetMl <= 0) return 0;
  return Math.min(1, Math.max(0, totalMl / targetMl));
}

/** "1.25 ל׳" from 1250. */
export function litersLabel(ml: number): string {
  const liters = ml / 1000;
  const text = Number.isInteger(liters) ? String(liters) : liters.toFixed(2).replace(/0$/, "");
  return `${text} ל׳`;
}

export type WaterPace = "ahead" | "on-track" | "behind" | "done";

/**
 * Where the day's drinking stands against a steady pace across waking hours.
 *
 * Paced from wake to two hours before sleep — drinking a liter at 23:00 to
 * "catch up" costs a night's sleep, so the target is due by then.
 */
export function waterPace(
  totalMl: number,
  targetMl: number,
  now: Date,
  wakeHour = 7,
  sleepHour = 23
): { pace: WaterPace; expectedMl: number } {
  if (totalMl >= targetMl) return { pace: "done", expectedMl: targetMl };
  const end = Math.max(wakeHour + 1, sleepHour - 2);
  const hour = now.getHours() + now.getMinutes() / 60;
  const share = Math.min(1, Math.max(0, (hour - wakeHour) / (end - wakeHour)));
  const expectedMl = Math.round((targetMl * share) / 50) * 50;
  if (totalMl >= expectedMl + WATER_STEP_ML) return { pace: "ahead", expectedMl };
  if (totalMl >= expectedMl - WATER_STEP_ML) return { pace: "on-track", expectedMl };
  return { pace: "behind", expectedMl };
}

export const WATER_PACE_LABELS: Record<WaterPace, string> = {
  ahead: "לפני הקצב",
  "on-track": "בקצב",
  behind: "מאחורי הקצב",
  done: "היעד הושג",
};
