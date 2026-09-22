import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";
import { getSupabaseClient } from "@/lib/supabase";

const base = createUserScopedRepo("learning_quotes");

export const learningQuotesRepo = {
  ...base,
  list: (userId: string) => base.list(userId, { orderBy: "created_at", ascending: false }),

  async listForBook(userId: string, bookId: string) {
    const { data, error } = await getSupabaseClient()
      .from("learning_quotes")
      .select("*")
      .eq("user_id", userId)
      .eq("book_id", bookId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
};
