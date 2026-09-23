"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { learningResourcesRepo, learningTopicsRepo } from "@/lib/db/learning";
import { learningCheckpointAnswersRepo } from "@/lib/db/learningCheckpointAnswers";
import { pioneerEasterEggClaimsRepo } from "@/lib/db/pioneerEasterEggClaims";
import type { UserAgeGroup, TeachingMode } from "@/types/learning";

export interface CheckpointAnswerState {
  checkpointId: string;
  selectedIndex: number;
  isCorrect: boolean;
  attempts: number;
}

// Same ownership check app/api/learning/lesson/generate/route.ts already
// does before touching learning_lesson_contents: stepId must belong to
// topicId, and topicId must belong to the caller — never trust a
// client-supplied pair without verifying the relationship server-side.
async function verifyStepOfTopic(userId: string, topicId: string, stepId: string): Promise<void> {
  const [topicRow, stepRow] = await Promise.all([learningTopicsRepo.get(userId, topicId), learningResourcesRepo.get(userId, stepId)]);
  if (!topicRow) throw new Error("Topic not found");
  if (!stepRow || stepRow.topic_id !== topicId) throw new Error("Step not found for this topic");
}

/** Every checkpoint answer recorded for this exact generated variant — what LessonViewport pre-fills from on open. */
export async function getCheckpointAnswersAction(topicId: string, stepId: string, userAgeGroup: UserAgeGroup, teachingMode: TeachingMode): Promise<CheckpointAnswerState[]> {
  const userId = await getCurrentUserId();
  await verifyStepOfTopic(userId, topicId, stepId);

  const rows = await learningCheckpointAnswersRepo.findForStep(userId, stepId, userAgeGroup, teachingMode);
  return rows.map((row) => ({
    checkpointId: row.checkpoint_id,
    selectedIndex: row.selected_index,
    isCorrect: row.is_correct,
    attempts: row.attempts,
  }));
}

/** Records one checkpoint answer (upserted — a retry updates the existing row and bumps `attempts`, see lib/db/learningCheckpointAnswers.ts). */
export async function submitCheckpointAnswerAction(
  topicId: string,
  stepId: string,
  checkpointId: string,
  userAgeGroup: UserAgeGroup,
  teachingMode: TeachingMode,
  selectedIndex: number,
  isCorrect: boolean
): Promise<CheckpointAnswerState> {
  const userId = await getCurrentUserId();
  await verifyStepOfTopic(userId, topicId, stepId);

  const row = await learningCheckpointAnswersRepo.upsertAnswer({
    userId,
    topicId,
    stepId,
    userAgeGroup,
    teachingMode,
    checkpointId,
    selectedIndex,
    isCorrect,
  });
  return { checkpointId: row.checkpoint_id, selectedIndex: row.selected_index, isCorrect: row.is_correct, attempts: row.attempts };
}

/** Every pioneer joke already claimed for this generated lesson variant — what PioneerProfileDrawer checks before showing the reveal as new or already-seen. */
export async function getPioneerEasterEggClaimsAction(topicId: string, stepId: string, userAgeGroup: UserAgeGroup, teachingMode: TeachingMode): Promise<string[]> {
  const userId = await getCurrentUserId();
  await verifyStepOfTopic(userId, topicId, stepId);

  const rows = await pioneerEasterEggClaimsRepo.findForStep(userId, stepId, userAgeGroup, teachingMode);
  return rows.map((row) => row.pioneer_id);
}

/**
 * Claims one pioneer's joke reveal. Returns whether this claim was new
 * (`claimed: true`, first time — the caller celebrates) or the person had
 * already claimed it before (`claimed: false` — same content shown again,
 * no XP, no re-celebration).
 */
export async function claimPioneerEasterEggAction(
  topicId: string,
  stepId: string,
  pioneerId: string,
  userAgeGroup: UserAgeGroup,
  teachingMode: TeachingMode
): Promise<{ claimed: boolean }> {
  const userId = await getCurrentUserId();
  await verifyStepOfTopic(userId, topicId, stepId);

  const row = await pioneerEasterEggClaimsRepo.claim({ userId, topicId, stepId, userAgeGroup, teachingMode, pioneerId });
  return { claimed: row !== null };
}
