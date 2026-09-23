import "server-only";
import { getSupabaseClient } from "@/lib/supabase";
import type { Database } from "@/types/database";

type ActiveCosmeticsRow = Database["public"]["Tables"]["learning_active_cosmetics"]["Row"];

// Not built on createUserScopedRepo, like article_extracts before it, but
// for the opposite reason: this table IS user-scoped, it just isn't
// id-keyed — user_id is the primary key itself (one row per user, the
// "currently equipped" pointer), which doesn't fit the factory's
// id+user_id shape.
export const learningActiveCosmeticsRepo = {
  async get(userId: string): Promise<ActiveCosmeticsRow | null> {
    const { data, error } = await getSupabaseClient().from("learning_active_cosmetics").select("*").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return data;
  },

  async setActiveTheme(userId: string, themeId: string | null): Promise<void> {
    const { error } = await getSupabaseClient().from("learning_active_cosmetics").upsert({ user_id: userId, active_theme: themeId }, { onConflict: "user_id" });
    if (error) throw error;
  },

  async setActiveParticleTrail(userId: string, trailId: string | null): Promise<void> {
    const { error } = await getSupabaseClient().from("learning_active_cosmetics").upsert({ user_id: userId, active_particle_trail: trailId }, { onConflict: "user_id" });
    if (error) throw error;
  },
};
