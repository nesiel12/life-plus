import { STAGNATION_DAYS } from "@/lib/intelligence/personalDNA/analyzers/goals";
import type { GoalStage } from "@/lib/goals/types";

export interface GoalStageInput {
  createdAt: string; // ISO
  completedMilestones: number;
  totalMilestones: number;
}

// A single goal's own stage — deliberately reuses the exact STAGNATION_DAYS
// threshold Personal DNA's goalMomentum analyzer already established for
// "has this stopped moving" (lib/intelligence/personalDNA/analyzers/
// goals.ts), rather than defining a second number that means the same
// thing. That analyzer flags stagnation in aggregate, across goals; this
// applies the identical rule to one goal at a time for its own stage badge.
export function deriveGoalStage(
  { createdAt, completedMilestones, totalMilestones }: GoalStageInput,
  now: number = Date.now()
): GoalStage {
  if (totalMilestones === 0) return "starting";
  if (completedMilestones >= totalMilestones) return "completed";

  if (completedMilestones === 0) {
    const ageDays = (now - new Date(createdAt).getTime()) / 86_400_000;
    if (ageDays >= STAGNATION_DAYS) return "stuck";
    return "starting";
  }

  return "in_progress";
}
