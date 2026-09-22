import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";
import { getSupabaseClient } from "@/lib/supabase";

const base = createUserScopedRepo("learning_books");

export const learningBooksRepo = {
  ...base,
  list: (userId: string) => base.list(userId, { orderBy: "created_at", ascending: false }),

  /** A topic's shelf — the Library tab and the topic canvas both read this. */
  async listForTopic(userId: string, topicId: string) {
    const { data, error } = await getSupabaseClient()
      .from("learning_books")
      .select("*")
      .eq("user_id", userId)
      .eq("topic_id", topicId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
};
