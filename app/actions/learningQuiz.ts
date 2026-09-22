"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { learningQuizAttemptsRepo } from "@/lib/db/learningQuizAttempts";
import { learningTopicsRepo } from "@/lib/db/learning";
import { toLearningQuizAttempt } from "@/lib/mappers";
import type { QuizQuestionRecord } from "@/types";

/** A topic's quiz history, most recent first — what the mastery index averages and the review screen replays. */
export async function listLearningQuizAttemptsAction(topicId: string) {
  const userId = await getCurrentUserId();
  const rows = await learningQuizAttemptsRepo.listForTopic(userId, topicId);
  return rows.map(toLearningQuizAttempt);
}

// A finished quiz, recorded once — the mastery index (lib/learning/mastery.ts)
// averages these; the review screen replays `questions` verbatim. Grading
// itself happens client-side against the AI-generated answer key
// (lib/learning/quiz.ts gradeQuiz), so what is recorded here is already the
// graded result, never ungraded raw answers the server would have to score.
export async function recordLearningQuizAttemptAction(input: {
  topicId: string;
  score: number;
  total: number;
  questions: QuizQuestionRecord[];
}) {
  const userId = await getCurrentUserId();
  await learningTopicsRepo.verifyOwnership(userId, input.topicId);
  const row = await learningQuizAttemptsRepo.insert({
    user_id: userId,
    topic_id: input.topicId,
    score: input.score,
    total: input.total,
    questions: input.questions,
  });
  return toLearningQuizAttempt(row);
}
