import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";
import { getSupabaseClient } from "@/lib/supabase";

const base = createUserScopedRepo("learning_quiz_attempts");

export const learningQuizAttemptsRepo = {
  ...base,
  list: (userId: string) => base.list(userId, { orderBy: "created_at", ascending: false }),

  /** A topic's quiz history, most recent first — what the mastery index averages. */
  async listForTopic(userId: string, topicId: string) {
    const { data, error } = await getSupabaseClient()
      .from("learning_quiz_attempts")
      .select("*")
      .eq("user_id", userId)
      .eq("topic_id", topicId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
};
