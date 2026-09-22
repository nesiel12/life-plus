"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { learningTopicsRepo } from "@/lib/db/learning";
import { srsCardsRepo } from "@/lib/db/srsCards";
import { FLASHCARD_SOURCE_TYPE, toLearningFlashcard } from "@/lib/learning/flashcards";
import type { SrsAnswer } from "@/lib/torah/srs";
import { GRADE_BY_ANSWER } from "@/lib/torah/srs";

export async function listLearningFlashcardsAction(topicId: string) {
  const userId = await getCurrentUserId();
  const rows = await srsCardsRepo.listBySource(userId, FLASHCARD_SOURCE_TYPE, topicId);
  return rows.map(toLearningFlashcard);
}

export async function addLearningFlashcardAction(topicId: string, front: string, back: string) {
  const userId = await getCurrentUserId();
  await learningTopicsRepo.verifyOwnership(userId, topicId);
  const [row] = await srsCardsRepo.insertMany([
    { user_id: userId, front, back, source_type: FLASHCARD_SOURCE_TYPE, source_id: topicId },
  ]);
  return toLearningFlashcard(row);
}

/** Adds a whole AI-generated deck in one call, so a partial failure never leaves half a deck. */
export async function addLearningFlashcardsAction(topicId: string, cards: { front: string; back: string }[]) {
  const userId = await getCurrentUserId();
  await learningTopicsRepo.verifyOwnership(userId, topicId);
  if (cards.length === 0) return [];
  const rows = await srsCardsRepo.insertMany(
    cards.map((c) => ({ user_id: userId, front: c.front, back: c.back, source_type: FLASHCARD_SOURCE_TYPE, source_id: topicId }))
  );
  return rows.map(toLearningFlashcard);
}

export async function gradeLearningFlashcardAction(cardId: string, answer: SrsAnswer) {
  const userId = await getCurrentUserId();
  const row = await srsCardsRepo.grade(userId, cardId, GRADE_BY_ANSWER[answer]);
  return toLearningFlashcard(row);
}

export async function deleteLearningFlashcardAction(cardId: string) {
  const userId = await getCurrentUserId();
  await srsCardsRepo.remove(userId, cardId);
}
