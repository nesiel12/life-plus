import type { MomentCategory } from "@/types";

export type TimelineEventKind = "moment" | "goal_started" | "milestone_achieved" | "knowledge_session";

export interface TimelineEvent {
  id: string;
  kind: TimelineEventKind;
  timestamp: string; // ISO
  category: MomentCategory;
  title: string;
  description?: string;
  // Drives the Timeline's "highlight important milestones and achievements"
  // treatment — true only for a real completed milestone, never inferred
  // from anything else.
  achievement: boolean;
}
