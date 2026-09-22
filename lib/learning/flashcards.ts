import { masteryTier, type MasteryTier, type SrsState } from "@/lib/torah/srs";
import type { Database, SrsSourceTypeDb } from "@/types/database";

// Learning-lab flashcards are srs_cards rows (lib/db/srsCards.ts), keyed by
// source_type = 'learning_topic', source_id = the topic's id — the real,
// tested SM-2 engine (lib/torah/srs.ts) reused whole, not reimplemented. This
// module is the one place that knows that mapping.

export const FLASHCARD_SOURCE_TYPE: SrsSourceTypeDb = "learning_topic";

type CardRow = Database["public"]["Tables"]["srs_cards"]["Row"];

export interface LearningFlashcard {
  id: string;
  topicId: string;
  front: string;
  back: string;
  state: SrsState;
  tier: MasteryTier;
  suspended: boolean;
}

export function toLearningFlashcard(row: CardRow): LearningFlashcard {
  const state: SrsState = {
    easeFactor: row.ease_factor,
    intervalDays: row.interval_days,
    repetitions: row.repetitions,
    lapses: row.lapses,
    dueAt: new Date(row.due_at),
  };
  return {
    id: row.id,
    topicId: row.source_id ?? "",
    front: row.front,
    back: row.back,
    state,
    tier: masteryTier(state),
    suspended: row.suspended_at !== null,
  };
}
