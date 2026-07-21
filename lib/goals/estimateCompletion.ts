// "Estimated completion" — real arithmetic over a real, already-computed
// Personal DNA signal (milestoneCompletionPace's average days-to-complete-
// a-milestone, lib/intelligence/personalDNA/analyzers/goals.ts), never a
// guess dressed up as one. `avgDaysPerMilestone` is null whenever the
// caller has no confident pace pattern to offer (see app/api/goals/insights
// — gated on the same MIN_CONFIDENCE_TO_SURFACE threshold every other
// consumer of personal_patterns uses) — in that case this returns null
// rather than inventing a default pace.
export function estimateDaysRemaining(
  remainingMilestones: number,
  avgDaysPerMilestone: number | null
): number | null {
  if (avgDaysPerMilestone === null || remainingMilestones <= 0) return null;
  return Math.round(remainingMilestones * avgDaysPerMilestone);
}
