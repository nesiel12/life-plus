import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";
import { getSupabaseClient } from "@/lib/supabase";

const repo = createUserScopedRepo("learning_streak_shield_consumptions");

export const streakShieldConsumptionsRepo = {
  ...repo,

  async listDates(userId: string): Promise<string[]> {
    const { data, error } = await getSupabaseClient().from("learning_streak_shield_consumptions").select("covers_date").eq("user_id", userId);
    if (error) throw error;
    return (data ?? []).map((row) => row.covers_date);
  },

  /** Idempotent: the table's own unique key on (user_id, covers_date) makes a repeat consume-attempt for the same day a no-op, not a duplicate row. */
  async consume(userId: string, coversDate: string): Promise<void> {
    const { error } = await getSupabaseClient()
      .from("learning_streak_shield_consumptions")
      .upsert({ user_id: userId, covers_date: coversDate }, { onConflict: "user_id,covers_date", ignoreDuplicates: true });
    if (error) throw error;
  },
};
