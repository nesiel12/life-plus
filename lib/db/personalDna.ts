import "server-only";
import { getSupabaseClient } from "@/lib/supabase";
import type { Database } from "@/types/database";

type PersonalDnaRow = Database["public"]["Tables"]["personal_dna"]["Row"];
type PersonalDnaUpdate = Database["public"]["Tables"]["personal_dna"]["Update"];

export const personalDnaRepo = {
  async get(userId: string): Promise<PersonalDnaRow | null> {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("personal_dna")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async upsert(userId: string, patch: PersonalDnaUpdate): Promise<PersonalDnaRow> {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("personal_dna")
      .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};
