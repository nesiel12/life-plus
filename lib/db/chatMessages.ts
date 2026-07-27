import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";
import { getSupabaseClient } from "@/lib/supabase";

const repo = createUserScopedRepo("chat_messages");

export const chatMessagesRepo = {
  ...repo,
  list: (userId: string) => repo.list(userId, { orderBy: "created_at", ascending: true }),

  // "Clear chat" deletes every message at once — the generic repo only
  // has a single-row remove(), so this drops to the raw client directly
  // for the one bulk case, same reasoning learning.ts's insertMany does.
  async clearAll(userId: string): Promise<void> {
    const { error } = await getSupabaseClient().from("chat_messages").delete().eq("user_id", userId);
    if (error) throw error;
  },
};
