"use client";

import { useCallback, useEffect, useState } from "react";
import {
  addLearningFlashcardsAction,
  deleteLearningFlashcardAction,
  gradeLearningFlashcardAction,
  listLearningFlashcardsAction,
} from "@/app/actions/learningFlashcards";
import { listLearningQuizAttemptsAction, recordLearningQuizAttemptAction } from "@/app/actions/learningQuiz";
import { computeMastery, type MasteryResult } from "@/lib/learning/mastery";
import type { LearningFlashcard } from "@/lib/learning/flashcards";
import type { SrsAnswer } from "@/lib/torah/srs";
import type { LearningQuizAttempt, LearningResource, QuizQuestionRecord } from "@/types";

/**
 * One topic's mastery evidence: its flashcard deck and quiz history, fetched
 * fresh whenever the selected topic changes, plus the blended score
 * (lib/learning/mastery.ts) recomputed from whatever is currently loaded.
 */
export function useTopicMastery(topicId: string | null, resources: readonly LearningResource[]) {
  const [flashcards, setFlashcards] = useState<LearningFlashcard[] | null>(null);
  const [attempts, setAttempts] = useState<LearningQuizAttempt[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    setFlashcards(null);
    setAttempts(null);
    try {
      const [cards, quizzes] = await Promise.all([listLearningFlashcardsAction(id), listLearningQuizAttemptsAction(id)]);
      setFlashcards(cards);
      setAttempts(quizzes);
    } catch {
      setFlashcards([]);
      setAttempts([]);
      setError("לא הצלחנו לטעון את נתוני השליטה.");
    }
  }, []);

  useEffect(() => {
    if (topicId) void load(topicId);
  }, [topicId, load]);

  const addGeneratedDeck = useCallback(
    async (cards: { front: string; back: string }[]) => {
      if (!topicId) return [];
      const created = await addLearningFlashcardsAction(topicId, cards);
      setFlashcards((current) => [...(current ?? []), ...created]);
      return created;
    },
    [topicId]
  );

  const gradeCard = useCallback(async (cardId: string, answer: SrsAnswer) => {
    const updated = await gradeLearningFlashcardAction(cardId, answer);
    setFlashcards((current) => (current ?? []).map((c) => (c.id === cardId ? updated : c)));
    return updated;
  }, []);

  const removeCard = useCallback(async (cardId: string) => {
    setFlashcards((current) => (current ?? []).filter((c) => c.id !== cardId));
    await deleteLearningFlashcardAction(cardId).catch(() => undefined);
  }, []);

  const recordAttempt = useCallback(
    async (score: number, total: number, questions: QuizQuestionRecord[]) => {
      if (!topicId) return;
      const created = await recordLearningQuizAttemptAction({ topicId, score, total, questions });
      setAttempts((current) => [created, ...(current ?? [])]);
    },
    [topicId]
  );

  const mastery: MasteryResult | null =
    flashcards && attempts
      ? computeMastery({
          resources,
          quizFractions: attempts.map((a) => a.score / a.total),
          flashcards: flashcards.map((c) => c.state),
        })
      : null;

  return {
    flashcards,
    attempts,
    mastery,
    loading: flashcards === null || attempts === null,
    error,
    addGeneratedDeck,
    gradeCard,
    removeCard,
    recordAttempt,
  };
}
