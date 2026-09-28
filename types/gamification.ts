import type { BadgeIcon } from "@/lib/gamification/badges";
import type { MomentumResult, MomentumTier } from "@/lib/gamification/momentum";

// The Momentum Dashboard's one wire shape — everything the four widgets
// (HeatmapGrid, StreakCard, MomentumGauge, BadgesGrid) need, computed once
// server-side in lib/gamification/statsService.ts.

export interface MomentumHeatmapData {
  /** Sparse "YYYY-MM-DD" -> completion count. Empty days are absent. */
  counts: Record<string, number>;
  /** The busiest single day, for scaling the heat ramp. */
  peak: number;
}

export interface MomentumStreakData {
  currentStreak: number;
  longestStreak: number;
  activeDays: number;
  freezesEarned: number;
  freezesAvailable: number;
}

export interface MomentumScoreData extends MomentumResult {
  tier: MomentumTier;
}

export interface MomentumBadgeView {
  id: string;
  title: string;
  description: string;
  icon: BadgeIcon;
  earned: boolean;
  earnedAt: string | null;
  /** 0..1; 1 whenever `earned` is true. */
  progress: number;
  /** Earned in this very read — the UI's cue to celebrate it. */
  isNew: boolean;
}

export interface MomentumDashboardData {
  heatmap: MomentumHeatmapData;
  streak: MomentumStreakData;
  momentum: MomentumScoreData;
  badges: MomentumBadgeView[];
}
