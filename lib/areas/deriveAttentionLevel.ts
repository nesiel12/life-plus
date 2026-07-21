import { WEAK_LIFE_AREA_SCORE_THRESHOLD } from "@/lib/intelligence/core/normalize";
import type { AttentionLevel } from "@/lib/areas/types";

const HEALTHY_SCORE_THRESHOLD = 70;

export interface AttentionInput {
  score: number;
  recentCount: number; // activity in the last window (see computeActivityTrend)
  previousCount: number; // activity in the window before that
  hasStuckGoal: boolean; // any active goal in this area is stage "stuck" (lib/goals/deriveGoalStage.ts)
}

// A life area's attention level — deterministic, reusing the exact
// "weakest area" threshold the Intelligence Engine and calendar suggestions
// already treat as the line between fine and not (WEAK_LIFE_AREA_SCORE_
// THRESHOLD), rather than a second number that means the same thing.
// A stuck goal or activity that's fully stopped overrides a merely
// decent score — "needs attention" is about real signals, not just a
// number sitting mid-range.
export function deriveAttentionLevel({ score, recentCount, previousCount, hasStuckGoal }: AttentionInput): AttentionLevel {
  const activityStopped = previousCount > 0 && recentCount === 0;

  if (hasStuckGoal || score < WEAK_LIFE_AREA_SCORE_THRESHOLD || activityStopped) {
    return "needs_attention";
  }

  if (score >= HEALTHY_SCORE_THRESHOLD && recentCount >= previousCount) {
    return "healthy";
  }

  return "growing";
}
