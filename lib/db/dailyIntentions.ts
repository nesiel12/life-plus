import "server-only";
import { getSupabaseClient } from "@/lib/supabase";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export const dailyIntentionsRepo = {
  async getForToday(userId: string): Promise<string> {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("daily_intentions")
      .select("*")
      .eq("user_id", userId)
      .eq("intention_date", todayISO())
      .maybeSingle();
    if (error) throw error;
    return data?.intention ?? "";
  },

  async setForToday(userId: string, intention: string): Promise<void> {
    const client = getSupabaseClient();
    const { error } = await client
      .from("daily_intentions")
      .upsert(
        { user_id: userId, intention_date: todayISO(), intention },
        { onConflict: "user_id,intention_date" }
      );
    if (error) throw error;
  },
};
