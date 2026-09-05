import { dayPartForHour } from "@/lib/onboarding/chronotype";
import type { ChronotypeSettings } from "@/types";

// Classifies each hour of the day against the user's own chronotype, so the
// timeline can show *their* peak and trough rather than a generic assumption
// that mornings are productive.
//
// Pure and dependency-light on purpose: this is consumed both by the client
// timeline and by the server-side CalendarAgent when it reasons about where
// to place work, and those must agree exactly. A disagreement would mean the
// AI proposes a slot the UI paints as low-energy.
export type HourEnergy = "peak" | "low" | "asleep" | "neutral";

/** Minutes since midnight for "HH:MM". Null if absent or malformed. */
export function parseClock(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

// Sleep normally wraps midnight (sleep 23:00, wake 06:30), so "asleep" is the
// wrap-around interval [sleep, wake) rather than a simple numeric range. When
// only one end is known we can't bound the interval, so nothing is asleep.
export function isAsleepAt(minutes: number, chronotype: ChronotypeSettings): boolean {
  const sleep = parseClock(chronotype.sleepTime);
  const wake = parseClock(chronotype.wakeTime);
  if (sleep === null || wake === null || sleep === wake) return false;
  return sleep < wake
    ? minutes >= sleep && minutes < wake
    : minutes >= sleep || minutes < wake;
}

/**
 * What the user's own check-ins have established about specific hours.
 *
 * Hour-precise, unlike the chronotype, which is expressed in coarse day
 * parts. Only hours with enough samples appear here — the thresholds live in
 * lib/checkins/analyze.ts.
 */
export interface ObservedEnergy {
  peakHours: number[];
  lowHours: number[];
}

/**
 * Energy for a given hour. Sleep wins over everything — a peak-focus day part
 * the user is asleep through is not a schedulable peak. Peak beats low when a
 * day part was somehow marked as both, since the optimistic read is the one
 * that puts work on the calendar and the user can always decline it.
 *
 * Observation beats declaration. `observed` carries what the user's check-ins
 * actually show, and it is consulted before the chronotype, because the
 * chronotype is what they predicted about themselves once during onboarding
 * and this is what has since happened. It is also hour-precise where the
 * chronotype is a five-bucket day part, so "16:00 is a trough" survives
 * instead of being flattened into "afternoons are good".
 *
 * Sleep still wins over both: a peak observed at 02:00 by someone who logged
 * a late night is not a slot to schedule work into.
 */
export function energyForHour(
  hour: number,
  chronotype: ChronotypeSettings,
  observed?: ObservedEnergy
): HourEnergy {
  if (isAsleepAt(hour * 60, chronotype)) return "asleep";

  if (observed?.peakHours.includes(hour)) return "peak";
  if (observed?.lowHours.includes(hour)) return "low";

  const part = dayPartForHour(hour);
  if (!part) return "neutral";

  if (chronotype.peakFocusHours?.includes(part)) return "peak";
  if (chronotype.lowEnergyHours?.includes(part)) return "low";
  return "neutral";
}

export const ENERGY_LABEL: Record<HourEnergy, string> = {
  peak: "שעת שיא",
  low: "אנרגיה נמוכה",
  asleep: "שינה",
  neutral: "",
};
