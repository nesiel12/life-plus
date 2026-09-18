import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";
import { getSupabaseClient } from "@/lib/supabase";
import type { Database } from "@/types/database";

type ScanRow = Database["public"]["Tables"]["handwriting_scans"]["Row"];

const base = createUserScopedRepo("handwriting_scans");

export const handwritingScansRepo = {
  ...base,

  list: (userId: string) => base.list(userId, { orderBy: "created_at", ascending: false }),

  /** Recent scans for the notes hub — newest first, saved and draft alike. */
  async recent(userId: string, limit = 12): Promise<ScanRow[]> {
    const { data, error } = await getSupabaseClient()
      .from("handwriting_scans")
      .select("*")
      .eq("user_id", userId)
      .neq("status", "discarded")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  },

  /** The scan a note came from, if it came from one. */
  async findForSummary(userId: string, summaryId: string): Promise<ScanRow | null> {
    const { data, error } = await getSupabaseClient()
      .from("handwriting_scans")
      .select("*")
      .eq("user_id", userId)
      .eq("summary_id", summaryId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
};
