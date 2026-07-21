import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";
import type { Flashcard } from "@/types";

const repo = createUserScopedRepo("knowledge_entries");

export const knowledgeEntriesRepo = {
  ...repo,
  list: (userId: string) => repo.list(userId, { orderBy: "entry_date", ascending: false }),

  // Learning Experience v2 (docs/ATLAS_ARCHITECTURE_VISION.md §10) —
  // ownership enforced the same way every other mutation in this file does,
  // via createUserScopedRepo's own update(userId, id, patch).
  markReviewed: (userId: string, entryId: string) =>
    repo.update(userId, entryId, { last_reviewed_at: new Date().toISOString() }),

  saveStudyMaterial: (userId: string, entryId: string, flashcards: Flashcard[], reviewQuestions: string[]) =>
    repo.update(userId, entryId, { flashcards, review_questions: reviewQuestions }),
};
