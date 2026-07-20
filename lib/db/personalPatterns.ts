import "server-only";
import { getSupabaseClient } from "@/lib/supabase";
import type { Database } from "@/types/database";

type PersonalPatternRow = Database["public"]["Tables"]["personal_patterns"]["Row"];
type PersonalPatternInsert = Database["public"]["Tables"]["personal_patterns"]["Insert"];

export const personalPatternsRepo = {
  async list(userId: string): Promise<PersonalPatternRow[]> {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("personal_patterns")
      .select("*")
      .eq("user_id", userId)
      .order("confidence", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  // One row per (category, pattern_type, subject) — analyzing again refines
  // the existing belief rather than accumulating duplicates. See
  // lib/intelligence/personalDNA/confidence.ts for how the incoming values
  // get reconciled with what's already stored before this is called.
  async upsert(
    userId: string,
    pattern: Omit<PersonalPatternInsert, "user_id">
  ): Promise<PersonalPatternRow> {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("personal_patterns")
      .upsert(
        { ...pattern, user_id: userId },
        { onConflict: "user_id,category,pattern_type,subject" }
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};
