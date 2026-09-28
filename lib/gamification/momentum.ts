// The Daily Momentum Score — a single 0-100% number for "how today is
// going," built from two of the app's existing surfaces: today's tasks and
// the daily habit check-ins. Purely arithmetic over what's already in the
// database; nothing here asks a model to judge anything.

import type { TaskPriority } from "@/types";

export interface MomentumTaskItem {
  priority: TaskPriority;
  isCompleted: boolean;
}

export interface MomentumHabitItem {
  isCompleted: boolean;
}

/** P1 is worth double a default task, P2 sits between the two — finishing
 *  the thing that actually mattered should move the meter more than
 *  checking off something trivial. */
export const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  P1: 2,
  P2: 1.5,
  P3: 1,
};

/** Habits sit between the two task weights: consistency matters, but a
 *  single daily habit shouldn't out-swing a high-priority task. */
export const HABIT_WEIGHT = 1.5;

export interface MomentumResult {
  /** 0-100, rounded. */
  score: number;
  pointsEarned: number;
  pointsPossible: number;
  tasksCompleted: number;
  tasksTotal: number;
  habitsCompleted: number;
  habitsTotal: number;
}

/**
 * `tasks` is today's relevant tasks (due today, or completed today — see
 * lib/gamification/statsService.ts for how "today's" is decided); `habits`
 * is every habit, since a habit is daily by design (habits.sql's own
 * comment). A day with nothing scheduled at all scores 0, not 100 — an
 * empty checklist isn't momentum.
 */
export function computeDailyMomentum(
  tasks: readonly MomentumTaskItem[],
  habits: readonly MomentumHabitItem[]
): MomentumResult {
  let pointsEarned = 0;
  let pointsPossible = 0;
  let tasksCompleted = 0;

  for (const task of tasks) {
    const weight = PRIORITY_WEIGHT[task.priority];
    pointsPossible += weight;
    if (task.isCompleted) {
      pointsEarned += weight;
      tasksCompleted += 1;
    }
  }

  let habitsCompleted = 0;
  for (const habit of habits) {
    pointsPossible += HABIT_WEIGHT;
    if (habit.isCompleted) {
      pointsEarned += HABIT_WEIGHT;
      habitsCompleted += 1;
    }
  }

  const rawScore = pointsPossible === 0 ? 0 : Math.round((pointsEarned / pointsPossible) * 100);

  return {
    score: Math.min(100, Math.max(0, rawScore)),
    pointsEarned,
    pointsPossible,
    tasksCompleted,
    tasksTotal: tasks.length,
    habitsCompleted,
    habitsTotal: habits.length,
  };
}

export type MomentumTier = "idle" | "starting" | "building" | "strong" | "onFire";

/** Buckets the score for the gauge's color/label, so the UI never hardcodes
 *  its own thresholds. */
export function momentumTier(score: number): MomentumTier {
  if (score >= 90) return "onFire";
  if (score >= 65) return "strong";
  if (score >= 35) return "building";
  if (score > 0) return "starting";
  return "idle";
}
