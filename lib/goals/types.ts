// Goals Experience v2 (docs/ATLAS_ARCHITECTURE_VISION.md §4) — the shape
// app/api/goals/insights returns and the Goals UI renders. Distinct from
// types/index.ts's Goal/Milestone (the stored entity) the same way
// lib/timeline/types.ts's TimelineEvent is distinct from Moment: this is a
// derived, computed view, not another storage shape.
export type GoalStage = "starting" | "in_progress" | "stuck" | "completed";

export interface NextAction {
  milestoneId: string;
  title: string;
  rationale: string;
  confidence: number; // 0..1 — reuses lib/suggestionConfidence.ts, not invented
  recommendationEventId: string;
}

export interface GoalInsight {
  goalId: string;
  stage: GoalStage;
  progress: number; // 0-100
  completedMilestones: number;
  totalMilestones: number;
  estimatedDaysRemaining: number | null;
  nextAction: NextAction | null;
  relatedMemory: string[];
}
