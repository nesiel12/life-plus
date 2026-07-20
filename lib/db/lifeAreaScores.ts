import "server-only";
import { getSupabaseClient } from "@/lib/supabase";
import type { Database, LifeAreaKeyDb } from "@/types/database";

type LifeAreaScoreRow = Database["public"]["Tables"]["life_area_scores"]["Row"];

const ALL_AREA_KEYS: LifeAreaKeyDb[] = ["faith", "family", "knowledge", "health", "career"];

export const lifeAreaScoresRepo = {
  async list(userId: string): Promise<LifeAreaScoreRow[]> {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("life_area_scores")
      .select("*")
      .eq("user_id", userId);
    if (error) throw error;
    return data ?? [];
  },

  // Called once when a user is first created so every area page has a score
  // to render instead of needing to special-case "no row yet" everywhere.
  async ensureDefaultsForUser(userId: string): Promise<void> {
    const client = getSupabaseClient();
    const { error } = await client
      .from("life_area_scores")
      .upsert(
        ALL_AREA_KEYS.map((area_key) => ({ user_id: userId, area_key, score: 50 })),
        { onConflict: "user_id,area_key", ignoreDuplicates: true }
      );
    if (error) throw error;
  },

  async setScore(
    userId: string,
    areaKey: LifeAreaKeyDb,
    score: number
  ): Promise<LifeAreaScoreRow> {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("life_area_scores")
      .upsert(
        { user_id: userId, area_key: areaKey, score, last_touched: new Date().toISOString().slice(0, 10) },
        { onConflict: "user_id,area_key" }
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};
