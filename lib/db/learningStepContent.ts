import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";
import { getSupabaseClient } from "@/lib/supabase";

const repo = createUserScopedRepo("learning_step_content");

export const learningStepContentRepo = {
  ...repo,

  /** The cache lookup: at most one row per step (the table's unique index on step_id). */
  async findByStep(userId: string, stepId: string) {
    const { data, error } = await getSupabaseClient()
      .from("learning_step_content")
      .select("*")
      .eq("user_id", userId)
      .eq("step_id", stepId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
};
