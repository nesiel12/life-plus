import "server-only";
import { getSupabaseClient } from "@/lib/supabase";
import type { Database } from "@/types/database";

type FitnessGoalsRow = Database["public"]["Tables"]["fitness_goals"]["Row"];
type FitnessGoalsUpdate = Database["public"]["Tables"]["fitness_goals"]["Update"];

// One row per user — a person has one active set of body targets, not a list.
export const fitnessGoalsRepo = {
  async get(userId: string): Promise<FitnessGoalsRow | null> {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("fitness_goals")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async upsert(userId: string, patch: FitnessGoalsUpdate): Promise<FitnessGoalsRow> {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("fitness_goals")
      .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};
