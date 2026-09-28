import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";
import { getSupabaseClient } from "@/lib/supabase";
import type { Database } from "@/types/database";

type MomentumBadgeRow = Database["public"]["Tables"]["momentum_badges"]["Row"];

const repo = createUserScopedRepo("momentum_badges");

export const momentumBadgesRepo = {
  ...repo,
  list: (userId: string) => repo.list(userId, { orderBy: "earned_at", ascending: true }),

  /**
   * Records every badge id newly unlocked this evaluation, in one round
   * trip. Idempotent via unique(user_id, badge_id) — claiming a badge the
   * user already has is a no-op rather than an error, since the catalog is
   * re-evaluated (and every already-earned id re-claimed) on every read.
   */
  async claimMany(userId: string, badgeIds: readonly string[]): Promise<MomentumBadgeRow[]> {
    if (badgeIds.length === 0) return [];
    const { data, error } = await getSupabaseClient()
      .from("momentum_badges")
      .upsert(
        badgeIds.map((badgeId) => ({ user_id: userId, badge_id: badgeId })),
        { onConflict: "user_id,badge_id", ignoreDuplicates: true }
      )
      .select();
    if (error) throw error;
    return data ?? [];
  },
};
