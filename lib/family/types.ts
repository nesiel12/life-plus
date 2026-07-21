import type { TimelineEvent } from "@/lib/timeline/types";

// Family Experience v2 (docs/ATLAS_ARCHITECTURE_VISION.md §10) — the shape
// app/api/family/insights returns. A derived, computed view over `people`
// and person-tagged `moments`, the same relationship lib/goals/types.ts's
// GoalInsight and lib/areas/types.ts's AreaInsight already have to their
// underlying entities.
export type RelationshipHealth = "healthy" | "growing" | "needs_attention";

export type SuggestedActionType = "call" | "message" | "meet" | "congratulate";

export interface SuggestedAction {
  type: SuggestedActionType;
  label: string;
  rationale: string;
  confidence: number;
  recommendationEventId: string;
}

export interface PersonInsight {
  personId: string;
  health: RelationshipHealth;
  daysSinceLastInteraction: number | null;
  interactionCount: number;
  recentCount: number;
  previousCount: number;
  daysUntilBirthday: number | null;
  relatedMemory: string[];
  suggestedAction: SuggestedAction | null;
  // A real relationship timeline, reusing lib/timeline/buildTimelineEvents.ts
  // as-is against this person's own moments — not a second timeline
  // implementation.
  timeline: TimelineEvent[];
}
