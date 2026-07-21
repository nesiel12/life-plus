// Learning Experience v2 (docs/ATLAS_ARCHITECTURE_VISION.md §10) — the
// shape app/api/torah/insights returns and the redesigned Torah Space page
// renders. Distinct from types/index.ts's KnowledgeEntry (the stored
// entity) the same way lib/goals/types.ts's GoalInsight is distinct from
// Goal — a derived, computed view, not another storage shape.
export interface NextReview {
  entryId: string;
  topic: string;
  rationale: string;
  confidence: number; // 0..1, reuses lib/suggestionConfidence.ts's shape of "real, not invented"
  recommendationEventId: string;
}

export interface EntryInsight {
  entryId: string;
  relatedMemory: string[];
  relatedKnowledge: string[]; // other entries' topics sharing a real keyword overlap
  connectedGoals: string[]; // active goal titles that textually relate to this entry
}

export interface LearningInsights {
  streakDays: number;
  topicFocus: string | null; // Personal DNA's learningTopicFocus pattern, only if confident
  cadencePerWeek: number | null; // Personal DNA's learningCadence pattern, only if confident
  nextReview: NextReview | null;
  entries: EntryInsight[];
}
