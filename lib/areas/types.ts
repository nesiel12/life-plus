import type { LifeAreaKey } from "@/types";

// Areas Experience v2 (docs/ATLAS_ARCHITECTURE_VISION.md §10) — the shape
// app/api/areas/insights returns and the Life Dashboard renders. A derived,
// computed view over data other tables already own, the same relationship
// lib/goals/types.ts's GoalInsight has to Goal.
export type AttentionLevel = "healthy" | "growing" | "needs_attention";

export interface RecommendedAreaAction {
  title: string;
  rationale: string;
  goalTitle: string;
}

export interface AreaInsight {
  areaKey: LifeAreaKey;
  score: number;
  attentionLevel: AttentionLevel;
  activeGoalsCount: number;
  recentCount: number;
  previousCount: number;
  lastActivityDaysAgo: number | null;
  recentHighlight: string | null;
  aiInsight: string | null;
  recommendedAction: RecommendedAreaAction | null;
}
