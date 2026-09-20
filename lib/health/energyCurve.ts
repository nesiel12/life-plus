// The circadian energy curve behind the "חלון האנרגיה" gauge.
//
// Pure and deterministic. It is a MODEL of a typical day shaped by the
// person's own answers — wake and sleep times, the day-parts they said they
// focus best and feel lowest in — and by what they logged today. It is not a
// measurement, and the UI labels it as an estimate.
//
// The shape is the textbook one: sleep inertia on waking, a late-morning
// peak, the early-afternoon dip, a smaller second wind, and a slide toward
// sleep. The person's own peak/low day-parts then lift or lower it, a workout
// lifts the next couple of hours, and a large meal deepens the dip after it.

import { dayPartToHours } from "@/lib/onboarding/chronotype";
import type { ChronotypeSettings, DayPart } from "@/types";

export interface EnergyPoint {
  hour: number;
  /** 0..1 */
  energy: number;
  asleep: boolean;
}

export interface EnergyInput {
  chronotype?: ChronotypeSettings;
  /** Start times of today's workouts. */
  workouts?: { startTime: string; endTime?: string }[];
  /** Today's meals, for the post-meal dip. */
  meals?: { eatenAt: string; calories?: number | null }[];
}

export function parseHour(value: string | undefined, fallback: number): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value?.trim() ?? "");
  if (!match) return fallback;
  const hour = Number(match[1]) + Number(match[2]) / 60;
  return hour >= 0 && hour < 24 ? hour : fallback;
}

function isAsleep(hour: number, wake: number, sleep: number): boolean {
  // Sleep may wrap past midnight (23:30 → 06:30) or not (01:00 → 09:00).
  return sleep > wake ? hour < wake || hour >= sleep : hour >= sleep && hour < wake;
}

/** Hours since waking, following the clock across midnight. */
function awakeFor(hour: number, wake: number): number {
  return (hour - wake + 24) % 24;
}

const clamp = (n: number) => Math.min(1, Math.max(0.05, n));

/**
 * Hourly energy for a day (24 points, hour 0..23, sampled at the half hour).
 */
export function energyCurve(input: EnergyInput = {}): EnergyPoint[] {
  const wake = parseHour(input.chronotype?.wakeTime, 7);
  const sleep = parseHour(input.chronotype?.sleepTime, 23);
  const peakHours = new Set((input.chronotype?.peakFocusHours ?? []).flatMap((part: DayPart) => dayPartToHours(part)));
  const lowHours = new Set((input.chronotype?.lowEnergyHours ?? []).flatMap((part: DayPart) => dayPartToHours(part)));

  const workoutEnds = (input.workouts ?? []).map((w) => {
    const end = new Date(w.endTime ?? w.startTime);
    return end.getHours() + end.getMinutes() / 60 + (w.endTime ? 0 : 0.75);
  });
  const bigMeals = (input.meals ?? [])
    .filter((m) => (m.calories ?? 500) >= 450)
    .map((m) => {
      const at = new Date(m.eatenAt);
      return at.getHours() + at.getMinutes() / 60;
    });

  return Array.from({ length: 24 }, (_, hour) => {
    const t = hour + 0.5;
    if (isAsleep(t, wake, sleep)) return { hour, energy: 0.08, asleep: true };

    const since = awakeFor(t, wake);
    // Sleep inertia: ~45 minutes of climbing out of it.
    let energy = since < 1 ? 0.45 + since * 0.3 : 0.75;
    // The late-morning peak, ~3–5 hours after waking.
    energy += 0.2 * Math.exp(-((since - 4) ** 2) / 4);
    // The post-lunch dip, ~6.5–8 hours after waking.
    energy -= 0.22 * Math.exp(-((since - 7.25) ** 2) / 1.6);
    // The second wind, ~10–11 hours in.
    energy += 0.1 * Math.exp(-((since - 10.5) ** 2) / 2.5);
    // The slide toward sleep over the last three waking hours.
    const toSleep = (sleep - t + 24) % 24;
    if (toSleep < 3) energy -= (3 - toSleep) * 0.14;

    // The person's own answers.
    if (peakHours.has(hour)) energy += 0.1;
    if (lowHours.has(hour)) energy -= 0.12;

    // Today's log.
    for (const end of workoutEnds) if (t >= end && t - end < 2.5) energy += 0.08;
    for (const at of bigMeals) if (t >= at + 0.5 && t - at < 2) energy -= 0.06;

    return { hour, energy: Math.round(clamp(energy) * 100) / 100, asleep: false };
  });
}

export interface EnergyWindow {
  kind: "peak" | "rest";
  startHour: number;
  /** Exclusive. */
  endHour: number;
}

/**
 * The contiguous stretches worth naming: peaks (≥0.8) to guard for deep work,
 * rest windows (a waking hour ≤0.55) that suit a walk, a nap or admin.
 * One-hour blips are merged into their neighbours, never reported alone.
 */
export function energyWindows(curve: readonly EnergyPoint[]): EnergyWindow[] {
  const windows: EnergyWindow[] = [];
  const classify = (p: EnergyPoint): EnergyWindow["kind"] | null =>
    p.asleep ? null : p.energy >= 0.8 ? "peak" : p.energy <= 0.55 ? "rest" : null;

  let current = null as EnergyWindow | null;
  for (const point of curve) {
    const kind = classify(point);
    if (kind && current?.kind === kind && current.endHour === point.hour) {
      current.endHour = point.hour + 1;
      continue;
    }
    if (current && current.endHour - current.startHour >= 2) windows.push(current);
    current = kind ? { kind, startHour: point.hour, endHour: point.hour + 1 } : null;
  }
  if (current && current.endHour - current.startHour >= 2) windows.push(current);
  return windows;
}

/** Energy right now, interpolated between the hourly samples. */
export function energyAt(curve: readonly EnergyPoint[], now: Date): number {
  const t = now.getHours() + now.getMinutes() / 60 - 0.5;
  const i = Math.floor((t + 24) % 24);
  const a = curve[i];
  const b = curve[(i + 1) % 24];
  if (!a || !b) return 0;
  const frac = t - Math.floor(t);
  return Math.round((a.energy + (b.energy - a.energy) * frac) * 100) / 100;
}

export function hourLabel(hour: number): string {
  return `${String(((hour % 24) + 24) % 24).padStart(2, "0")}:00`;
}

/** What to do with the current level — one short line. */
export function energyAdvice(level: number, windows: readonly EnergyWindow[], now: Date): string {
  const hour = now.getHours();
  const nextPeak = windows.find((w) => w.kind === "peak" && w.startHour > hour);
  const inPeak = windows.find((w) => w.kind === "peak" && hour >= w.startHour && hour < w.endHour);
  if (inPeak) return `חלון השיא פתוח עד ${hourLabel(inPeak.endHour)} — זה הזמן למשימה הכי תובענית של היום.`;
  if (level <= 0.55) {
    return nextPeak
      ? `אנרגיה נמוכה עכשיו. הליכה קצרה או משימות קלות — השיא הבא סביב ${hourLabel(nextPeak.startHour)}.`
      : "אנרגיה נמוכה עכשיו — זמן טוב להאט, לשתות מים ולהתכונן לשינה.";
  }
  return nextPeak ? `אנרגיה יציבה. חלון השיא הבא מתחיל ב-${hourLabel(nextPeak.startHour)}.` : "אנרגיה יציבה — מתאים לעבודה רגילה ולסגירת קצוות.";
}
