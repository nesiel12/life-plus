import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";
import { getSupabaseClient } from "@/lib/supabase";
import type { TeachingModeDb, UserAgeGroupDb } from "@/types/database";

const repo = createUserScopedRepo("learning_lesson_contents");

export const learningLessonContentsRepo = {
  ...repo,

  /**
   * The cache lookup: one row per (topic, step, age group, teaching mode),
   * enforced by the table's own unique index — this can never return more
   * than one row.
   */
  async findCached(userId: string, topicId: string, stepId: string, userAgeGroup: UserAgeGroupDb, teachingMode: TeachingModeDb) {
    const { data, error } = await getSupabaseClient()
      .from("learning_lesson_contents")
      .select("*")
      .eq("user_id", userId)
      .eq("topic_id", topicId)
      .eq("step_id", stepId)
      .eq("user_age_group", userAgeGroup)
      .eq("teaching_mode", teachingMode)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
};
