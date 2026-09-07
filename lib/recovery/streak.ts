// The recovery streak: derived, never stored.
//
// A stored counter drifts — a missed job, a clock change, a relapse logged
// after the fact, and the number on screen stops matching the events that
// produced it. Everything here is computed from `cleanSince` plus the event
// log, so the two can never disagree.
//
// Pure: no Date construction from "now", no timezone lookups. Callers pass
// the instant. That is what makes the milestone and relapse edges testable.

export type RecoveryEventKind = "relapse" | "urge" | "note";

export interface RecoveryEvent {
  id: string;
  kind: RecoveryEventKind;
  occurredAt: string;
  intensity?: number;
  trigger?: string;
  note?: string;
}

export interface RecoveryProgram {
  id: string;
  title: string;
  cleanSince: string;
  reasons: string[];
  triggers: string[];
  riskHours: number[];
  copingStrategies: string[];
  celebratedMilestones: number[];
  isActive: boolean;
  createdAt: string;
}

/**
 * The milestones worth marking.
 *
 * Dense early and sparse later, because that is how the difficulty is
 * distributed: day 1 and day 3 are genuine achievements, and by day 365 the
 * meaningful unit is a year, not a fortnight.
 */
export const MILESTONE_DAYS = [1, 3, 7, 14, 30, 60, 90, 180, 365, 730] as const;

export const MILESTONE_LABELS: Record<number, string> = {
  1: "יום ראשון נקי",
  3: "שלושה ימים",
  7: "שבוע שלם",
  14: "שבועיים",
  30: "חודש",
  60: "חודשיים",
  90: "שלושה חודשים",
  180: "חצי שנה",
  365: "שנה",
  730: "שנתיים",
};

const DAY_MS = 86_400_000;

/** Whole days elapsed between two instants. Negative clamps to 0. */
export function daysBetween(fromIso: string, at: Date): number {
  const from = new Date(fromIso).getTime();
  if (!Number.isFinite(from)) return 0;
  return Math.max(0, Math.floor((at.getTime() - from) / DAY_MS));
}

/**
 * When the current streak actually started.
 *
 * The later of `cleanSince` and the most recent relapse. Editing `cleanSince`
 * backwards must not resurrect a streak a relapse already ended, and logging
 * a relapse must not be undone by a stale start date.
 */
export function streakStart(program: RecoveryProgram, events: RecoveryEvent[]): string {
  const lastRelapse = events
    .filter((e) => e.kind === "relapse")
    .map((e) => e.occurredAt)
    .sort()
    .at(-1);

  if (!lastRelapse) return program.cleanSince;
  return lastRelapse > program.cleanSince ? lastRelapse : program.cleanSince;
}

export interface StreakState {
  /** Days clean in the current run. */
  currentDays: number;
  /** The best run ever recorded, including the current one. */
  bestDays: number;
  streakStartedAt: string;
  totalRelapses: number;
  /** Cravings logged and survived — the number most worth showing. */
  urgesResisted: number;
  /** The most recent milestone reached, if any. */
  lastMilestone: number | null;
  /** The next milestone and how far away it is. */
  nextMilestone: number | null;
  daysToNextMilestone: number | null;
  /** Milestones reached but not yet celebrated. */
  pendingCelebrations: number[];
}

export function computeStreak(
  program: RecoveryProgram,
  events: RecoveryEvent[],
  at: Date
): StreakState {
  const startedAt = streakStart(program, events);
  const currentDays = daysBetween(startedAt, at);

  const relapses = events
    .filter((e) => e.kind === "relapse")
    .map((e) => e.occurredAt)
    .sort();

  // Each past run is the span between consecutive relapses, with the first
  // measured from the original clean date.
  let bestDays = currentDays;
  let runStart = program.cleanSince;
  for (const relapse of relapses) {
    if (relapse > runStart) {
      bestDays = Math.max(bestDays, daysBetween(runStart, new Date(relapse)));
    }
    runStart = relapse > runStart ? relapse : runStart;
  }

  const reached = MILESTONE_DAYS.filter((d) => currentDays >= d);
  const lastMilestone = reached.at(-1) ?? null;
  const nextMilestone = MILESTONE_DAYS.find((d) => d > currentDays) ?? null;

  return {
    currentDays,
    bestDays,
    streakStartedAt: startedAt,
    totalRelapses: relapses.length,
    urgesResisted: events.filter((e) => e.kind === "urge").length,
    lastMilestone,
    nextMilestone,
    daysToNextMilestone: nextMilestone === null ? null : nextMilestone - currentDays,
    // Only milestones inside the CURRENT run: after a relapse, day 7 is an
    // achievement to be celebrated again, not one already banked.
    pendingCelebrations: reached.filter((d) => !program.celebratedMilestones.includes(d)),
  };
}

/**
 * Which local hours have historically carried the most cravings.
 *
 * Needs enough evidence to be a pattern rather than a coincidence — telling
 * someone "your risk hour is 3pm" off a single data point is worse than
 * saying nothing, because they will believe it.
 */
export function riskHoursFromEvents(
  events: RecoveryEvent[],
  hourOf: (iso: string) => number,
  minSamples = 4
): number[] {
  const urges = events.filter((e) => e.kind === "urge" || e.kind === "relapse");
  if (urges.length < minSamples) return [];

  const counts = new Map<number, number>();
  for (const event of urges) {
    const hour = hourOf(event.occurredAt);
    counts.set(hour, (counts.get(hour) ?? 0) + 1);
  }

  // Hours carrying at least twice the flat average.
  const average = urges.length / 24;
  return [...counts.entries()]
    .filter(([, count]) => count >= Math.max(2, average * 2))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([hour]) => hour)
    .sort((a, b) => a - b);
}

/** The streak in words: "12 ימים נקיים". */
export function formatStreak(days: number): string {
  if (days === 0) return "היום הראשון";
  if (days === 1) return "יום אחד נקי";
  if (days === 2) return "יומיים נקיים";
  return `${days} ימים נקיים`;
}

/** Progress toward the next milestone, 0-1. Null when there is none left. */
export function milestoneProgress(state: StreakState): number | null {
  if (state.nextMilestone === null) return null;
  const previous = state.lastMilestone ?? 0;
  const span = state.nextMilestone - previous;
  if (span <= 0) return null;
  return Math.min(1, Math.max(0, (state.currentDays - previous) / span));
}
