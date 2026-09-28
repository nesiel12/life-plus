import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";
import { getSupabaseClient } from "@/lib/supabase";

const repo = createUserScopedRepo("momentum_streak_freezes");

export const momentumStreakFreezesRepo = {
  ...repo,
  list: (userId: string) => repo.list(userId, { orderBy: "covers_date", ascending: true }),

  /**
   * Spends one freeze to cover a specific missed day. Idempotent via
   * unique(user_id, covers_date) — the same day can only ever be covered
   * once, so a duplicate call (a retried request) can't spend two freezes
   * for one gap.
   */
  async consume(userId: string, coversDate: string): Promise<void> {
    const { error } = await getSupabaseClient()
      .from("momentum_streak_freezes")
      .upsert({ user_id: userId, covers_date: coversDate }, { onConflict: "user_id,covers_date", ignoreDuplicates: true });
    if (error) throw error;
  },
};
