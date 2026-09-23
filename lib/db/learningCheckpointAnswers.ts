import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";
import { getSupabaseClient } from "@/lib/supabase";
import type { TeachingModeDb, UserAgeGroupDb } from "@/types/database";

const repo = createUserScopedRepo("learning_checkpoint_answers");

export const learningCheckpointAnswersRepo = {
  ...repo,

  /** Every answer recorded for one generated lesson variant — what LessonViewport pre-fills its checkpoints from. */
  async findForStep(userId: string, stepId: string, userAgeGroup: UserAgeGroupDb, teachingMode: TeachingModeDb) {
    const { data, error } = await getSupabaseClient()
      .from("learning_checkpoint_answers")
      .select("*")
      .eq("user_id", userId)
      .eq("step_id", stepId)
      .eq("user_age_group", userAgeGroup)
      .eq("teaching_mode", teachingMode);
    if (error) throw error;
    return data;
  },

  /**
   * Records an answer, upserting by the table's own unique key
   * (step_id, user_age_group, teaching_mode, checkpoint_id) — a re-answer
   * updates the existing row (new selection, new correctness) and bumps
   * `attempts`, rather than accumulating one row per attempt.
   */
  async upsertAnswer(input: {
    userId: string;
    topicId: string;
    stepId: string;
    userAgeGroup: UserAgeGroupDb;
    teachingMode: TeachingModeDb;
    checkpointId: string;
    selectedIndex: number;
    isCorrect: boolean;
  }) {
    const existing = await getSupabaseClient()
      .from("learning_checkpoint_answers")
      .select("attempts")
      .eq("user_id", input.userId)
      .eq("step_id", input.stepId)
      .eq("user_age_group", input.userAgeGroup)
      .eq("teaching_mode", input.teachingMode)
      .eq("checkpoint_id", input.checkpointId)
      .maybeSingle();
    if (existing.error) throw existing.error;

    const { data, error } = await getSupabaseClient()
      .from("learning_checkpoint_answers")
      .upsert(
        {
          user_id: input.userId,
          topic_id: input.topicId,
          step_id: input.stepId,
          user_age_group: input.userAgeGroup,
          teaching_mode: input.teachingMode,
          checkpoint_id: input.checkpointId,
          selected_index: input.selectedIndex,
          is_correct: input.isCorrect,
          attempts: (existing.data?.attempts ?? 0) + 1,
        },
        { onConflict: "step_id,user_age_group,teaching_mode,checkpoint_id" }
      )
      .select("*")
      .single();
    if (error) throw error;
    return data;
  },
};
