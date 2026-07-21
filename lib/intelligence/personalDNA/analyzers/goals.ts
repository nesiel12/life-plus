import type { PatternCandidate } from "@/lib/intelligence/personalDNA/types";

const MIN_GOALS_FOR_TASK_SIZE = 3;
const MIN_COMPLETION_RATE_DIFF = 0.15; // groups must differ by at least this much to count as a real signal
const MIN_OPEN_GOALS_FOR_MOMENTUM = 2;
// Exported for lib/goals/deriveGoalStage.ts (Goals Experience v2) — a
// single goal's "stuck" stage should mean exactly the same 14-day threshold
// this analyzer already uses to flag stagnation across goals in aggregate,
// not a second number that could drift from it.
export const STAGNATION_DAYS = 14;
const MIN_STAGNANT_SHARE = 0.4; // at least 40% of open goals stalled to call it a pattern
const MIN_COMPLETED_MILESTONES_FOR_PACE = 3;
const PACE_CONFIDENT_COUNT = 10; // evidence count at which pace strength saturates

export interface GoalSummaryInput {
  createdAt: string; // ISO
  milestoneCount: number;
  doneCount: number;
}

export interface MilestonePaceInput {
  createdAt: string; // ISO
  completedAt: string; // ISO — pre-filtered to only completed milestones with a real timestamp
}

function median(numbers: number[]): number {
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function analyzeTaskSizePreference(goals: GoalSummaryInput[]): PatternCandidate | null {
  const withMilestones = goals.filter((g) => g.milestoneCount > 0);
  if (withMilestones.length < MIN_GOALS_FOR_TASK_SIZE) return null;

  const medianSize = median(withMilestones.map((g) => g.milestoneCount));
  const smaller = withMilestones.filter((g) => g.milestoneCount <= medianSize);
  const larger = withMilestones.filter((g) => g.milestoneCount > medianSize);
  if (smaller.length === 0 || larger.length === 0) return null;

  const avgCompletionRate = (group: GoalSummaryInput[]) =>
    group.reduce((sum, g) => sum + g.doneCount / g.milestoneCount, 0) / group.length;

  const diff = avgCompletionRate(smaller) - avgCompletionRate(larger);
  if (Math.abs(diff) < MIN_COMPLETION_RATE_DIFF) return null;

  const prefersSmallTasks = diff > 0;
  return {
    category: "goals",
    patternType: "taskSizePreference",
    subject: "",
    value: prefersSmallTasks ? "smallTasks" : "largeTasks",
    description: prefersSmallTasks
      ? "משלים יעדים טוב יותר כשהם מפורקים למספר גדול של משימות קטנות."
      : "משלים יעדים טוב יותר כשהם מפורקים למספר קטן של משימות גדולות.",
    evidenceCount: withMilestones.length,
    strength: Math.min(1, Math.abs(diff)),
    source: "goals",
  };
}

function analyzeGoalMomentum(goals: GoalSummaryInput[], now: number): PatternCandidate | null {
  const openGoals = goals.filter((g) => g.milestoneCount === 0 || g.doneCount < g.milestoneCount);
  if (openGoals.length < MIN_OPEN_GOALS_FOR_MOMENTUM) return null;

  const stagnant = openGoals.filter(
    (g) => g.doneCount === 0 && (now - new Date(g.createdAt).getTime()) / 86_400_000 >= STAGNATION_DAYS
  );
  const stagnantShare = stagnant.length / openGoals.length;
  if (stagnantShare < MIN_STAGNANT_SHARE) return null;

  return {
    category: "goals",
    patternType: "goalMomentum",
    subject: "",
    value: "stagnationRisk",
    description: `כ-${Math.round(stagnantShare * 100)}% מהיעדים הפתוחים שלו לא זזו כלל למעלה משבועיים מאז שנוצרו.`,
    evidenceCount: openGoals.length,
    strength: stagnantShare,
    source: "goals",
  };
}

function analyzeMilestonePace(completedMilestones: MilestonePaceInput[]): PatternCandidate | null {
  const paces = completedMilestones
    .map((m) => (new Date(m.completedAt).getTime() - new Date(m.createdAt).getTime()) / 86_400_000)
    .filter((days) => days >= 0);
  if (paces.length < MIN_COMPLETED_MILESTONES_FOR_PACE) return null;

  const avgDays = paces.reduce((sum, days) => sum + days, 0) / paces.length;
  return {
    category: "goals",
    patternType: "milestoneCompletionPace",
    subject: "",
    value: avgDays.toFixed(1),
    description: `בממוצע, משלים אבן דרך תוך כ-${avgDays.toFixed(1)} ימים מרגע שהיא נוספה ליעד.`,
    evidenceCount: paces.length,
    strength: Math.min(1, paces.length / PACE_CONFIDENT_COUNT),
    source: "milestones",
  };
}

// Goal-behavior patterns (docs/ATLAS_ARCHITECTURE_VISION.md §3): how the
// user actually engages with goals he's set — task-size preference (does
// he finish more when goals are broken into many small steps or few large
// ones), momentum/stagnation, and completion pace once milestones carry a
// real completed_at timestamp (migration 20260720000003 — goals completed
// before that migration have no pace evidence, and correctly contribute
// none rather than a guessed one).
export function analyzeGoalPatterns(
  goals: GoalSummaryInput[],
  completedMilestones: MilestonePaceInput[],
  now: number = Date.now()
): PatternCandidate[] {
  return [analyzeTaskSizePreference(goals), analyzeGoalMomentum(goals, now), analyzeMilestonePace(completedMilestones)].filter(
    (candidate): candidate is PatternCandidate => candidate !== null
  );
}
