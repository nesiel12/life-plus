import type { CheckIn, CheckInActivity } from "@/types";

// Turning check-ins into a picture of the user's actual day.
//
// Pure and tested, for the same reason every other derived number in this
// app is: these figures are shown as facts about someone's life, and an
// average computed inside a component is an average nobody can check.
//
// The governing rule here is that thin evidence must not be presented as a
// finding. Two check-ins do not establish that someone trains on Tuesdays,
// and a routine engine that says so after two samples is worse than one that
// says nothing — the user corrects it once, is contradicted again, and stops
// believing the whole feature. Every output below carries the sample count
// it rests on, and the helpers that produce conclusions refuse to speak
// below a threshold.

/** Below this many samples for an hour, it is a coincidence, not a routine. */
export const MIN_SAMPLES_FOR_ROUTINE = 3;

/** Below this many overall, the profile as a whole says nothing. */
export const MIN_SAMPLES_FOR_PROFILE = 5;

/** Average energy at or above this marks an hour as a peak. */
export const PEAK_ENERGY_THRESHOLD = 4;

/** At or below this, an hour is a trough. */
export const LOW_ENERGY_THRESHOLD = 2.5;

export interface HourProfile {
  hour: number;
  samples: number;
  /** Mean 1-5, or null when there is nothing to average. */
  averageEnergy: number | null;
  /** The activity reported most often in this hour, if any. */
  topActivity: CheckInActivity | null;
  /** How dominant that activity is, 0-1. */
  topActivityShare: number;
}

export interface CheckInProfile {
  /** 24 entries, index === hour. Hours with no data are present but empty. */
  hours: HourProfile[];
  totalSamples: number;
  /** Hours whose average energy clears PEAK_ENERGY_THRESHOLD, with evidence. */
  peakHours: number[];
  /** Hours that are reliably low. */
  lowHours: number[];
  /** Overall mean energy, or null. */
  averageEnergy: number | null;
  /** Share of check-ins by activity, descending. */
  activityMix: { activity: CheckInActivity; count: number; share: number }[];
  /** True once there is enough to say anything at all. */
  hasEnoughData: boolean;
}

function emptyHour(hour: number): HourProfile {
  return { hour, samples: 0, averageEnergy: null, topActivity: null, topActivityShare: 0 };
}

/**
 * Builds the profile from raw check-ins.
 *
 * Hours are local, taken from occurred_at — the field that records when the
 * activity happened rather than when it was typed.
 */
export function buildCheckInProfile(checkIns: CheckIn[]): CheckInProfile {
  const buckets: { energies: number[]; activities: Map<CheckInActivity, number> }[] = Array.from(
    { length: 24 },
    () => ({ energies: [], activities: new Map() })
  );

  const activityTotals = new Map<CheckInActivity, number>();
  let energySum = 0;
  let total = 0;

  for (const entry of checkIns) {
    const at = new Date(entry.occurredAt);
    if (Number.isNaN(at.getTime())) continue;
    const hour = at.getHours();
    const bucket = buckets[hour];
    if (!bucket) continue;

    bucket.energies.push(entry.energy);
    bucket.activities.set(entry.activity, (bucket.activities.get(entry.activity) ?? 0) + 1);
    activityTotals.set(entry.activity, (activityTotals.get(entry.activity) ?? 0) + 1);
    energySum += entry.energy;
    total++;
  }

  const hours: HourProfile[] = buckets.map((bucket, hour) => {
    if (bucket.energies.length === 0) return emptyHour(hour);

    let topActivity: CheckInActivity | null = null;
    let topCount = 0;
    for (const [activity, count] of bucket.activities) {
      // Ties resolve to whichever came first in iteration order. Picking
      // arbitrarily is fine at these counts; what matters is that the share
      // is reported honestly alongside it, so a 50/50 hour reads as 0.5.
      if (count > topCount) {
        topActivity = activity;
        topCount = count;
      }
    }

    const samples = bucket.energies.length;
    return {
      hour,
      samples,
      averageEnergy: bucket.energies.reduce((sum, n) => sum + n, 0) / samples,
      topActivity,
      topActivityShare: topCount / samples,
    };
  });

  const wellEvidenced = hours.filter((h) => h.samples >= MIN_SAMPLES_FOR_ROUTINE);

  const activityMix = [...activityTotals.entries()]
    .map(([activity, count]) => ({ activity, count, share: total > 0 ? count / total : 0 }))
    .sort((a, b) => b.count - a.count);

  return {
    hours,
    totalSamples: total,
    peakHours: wellEvidenced
      .filter((h) => (h.averageEnergy ?? 0) >= PEAK_ENERGY_THRESHOLD)
      .map((h) => h.hour),
    lowHours: wellEvidenced
      .filter((h) => h.averageEnergy !== null && h.averageEnergy <= LOW_ENERGY_THRESHOLD)
      .map((h) => h.hour),
    averageEnergy: total > 0 ? energySum / total : null,
    activityMix,
    hasEnoughData: total >= MIN_SAMPLES_FOR_PROFILE,
  };
}

/**
 * Whether it is time to ask again.
 *
 * Two rules, and the second is the one that matters. Ask no more often than
 * the interval — and never outside waking hours, because a check-in
 * notification at 04:00 is not a gentle nudge, it teaches the user to
 * dismiss the widget on sight.
 */
export function shouldPromptCheckIn(options: {
  lastCheckInAt: string | null;
  now: Date;
  intervalHours: number;
  /** Local hours during which asking is acceptable. */
  wakingFrom?: number;
  wakingTo?: number;
}): boolean {
  const { lastCheckInAt, now, intervalHours, wakingFrom = 8, wakingTo = 23 } = options;

  const hour = now.getHours();
  if (hour < wakingFrom || hour >= wakingTo) return false;

  if (!lastCheckInAt) return true;
  const last = new Date(lastCheckInAt);
  if (Number.isNaN(last.getTime())) return true;

  const elapsedHours = (now.getTime() - last.getTime()) / (60 * 60 * 1000);
  // A future timestamp means a clock change or a bad row; treating it as
  // "just answered" is the safe direction — it delays a prompt rather than
  // firing one repeatedly.
  if (elapsedHours < 0) return false;
  return elapsedHours >= intervalHours;
}

/**
 * What the profile suggests scheduling into a given hour.
 *
 * Returns null rather than guessing when the hour is thinly sampled. A
 * scheduling hint drawn from one observation is indistinguishable from a
 * confident one to the person reading it.
 */
export function energyAdviceForHour(
  profile: CheckInProfile,
  hour: number
): { level: "peak" | "low" | "typical"; samples: number } | null {
  const entry = profile.hours[hour];
  if (!entry || entry.samples < MIN_SAMPLES_FOR_ROUTINE || entry.averageEnergy === null) return null;

  if (entry.averageEnergy >= PEAK_ENERGY_THRESHOLD) return { level: "peak", samples: entry.samples };
  if (entry.averageEnergy <= LOW_ENERGY_THRESHOLD) return { level: "low", samples: entry.samples };
  return { level: "typical", samples: entry.samples };
}
