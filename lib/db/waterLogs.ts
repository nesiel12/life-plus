import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";
import { getSupabaseClient } from "@/lib/supabase";
import type { Database } from "@/types/database";

type WaterRow = Database["public"]["Tables"]["water_logs"]["Row"];

const base = createUserScopedRepo("water_logs");

export const waterLogsRepo = {
  ...base,

  /** Logs at or after an instant — the caller's own local midnight. */
  async listSince(userId: string, since: Date): Promise<WaterRow[]> {
    const { data, error } = await getSupabaseClient()
      .from("water_logs")
      .select("*")
      .eq("user_id", userId)
      .gte("logged_at", since.toISOString())
      .order("logged_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },
};
