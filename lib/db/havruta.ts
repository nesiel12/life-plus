import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";
import { getSupabaseClient } from "@/lib/supabase";
import type { Database, HavrutaModeDb, HavrutaSubjectTypeDb } from "@/types/database";

type Tables = Database["public"]["Tables"];
type ThreadRow = Tables["havruta_threads"]["Row"];
type MessageRow = Tables["havruta_messages"]["Row"];
type AlertRow = Tables["contradiction_alerts"]["Row"];
type AlertInsert = Tables["contradiction_alerts"]["Insert"];
type ScanInsert = Tables["contradiction_scan_pairs"]["Insert"];

const threads = createUserScopedRepo("havruta_threads");
const messages = createUserScopedRepo("havruta_messages");
const alerts = createUserScopedRepo("contradiction_alerts");

export const havrutaThreadsRepo = {
  ...threads,

  /** The newest thread on a subject in a mode — a subject reopens its conversation. */
  async findForSubject(
    userId: string,
    subjectType: HavrutaSubjectTypeDb,
    subjectId: string,
    mode: HavrutaModeDb
  ): Promise<ThreadRow | null> {
    const { data, error } = await getSupabaseClient()
      .from("havruta_threads")
      .select("*")
      .eq("user_id", userId)
      .eq("subject_type", subjectType)
      .eq("subject_id", subjectId)
      .eq("mode", mode)
      .is("closed_at", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async listRecent(userId: string, limit = 6): Promise<ThreadRow[]> {
    const { data, error } = await getSupabaseClient()
      .from("havruta_threads")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  },

  /** Threads touched since an instant — the Shabbat sheet's week. */
  async listUpdatedSince(userId: string, since: Date): Promise<ThreadRow[]> {
    const { data, error } = await getSupabaseClient()
      .from("havruta_threads")
      .select("*")
      .eq("user_id", userId)
      .gte("updated_at", since.toISOString())
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  /** Bumps updated_at so "recent discussions" reflects the last message. */
  touch: (userId: string, threadId: string) => threads.update(userId, threadId, { closed_at: null }),
};

export const havrutaMessagesRepo = {
  ...messages,

  async listForThread(userId: string, threadId: string): Promise<MessageRow[]> {
    const { data, error } = await getSupabaseClient()
      .from("havruta_messages")
      .select("*")
      .eq("user_id", userId)
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },
};

export const contradictionAlertsRepo = {
  ...alerts,

  async listOpen(userId: string, limit = 20): Promise<AlertRow[]> {
    const { data, error } = await getSupabaseClient()
      .from("contradiction_alerts")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  },

  /**
   * Inserts new alerts, never touching an existing pair.
   *
   * ignoreDuplicates is TRUE here, unlike kg_edges: an existing row carries
   * the learner's decision (dismissed, resolved), and a re-scan overwriting
   * it back to "open" is precisely the nag this table's status exists to stop.
   */
  async insertNew(rows: AlertInsert[]): Promise<AlertRow[]> {
    if (rows.length === 0) return [];
    const { data, error } = await getSupabaseClient()
      .from("contradiction_alerts")
      .upsert(rows, { onConflict: "user_id,left_type,left_id,right_type,right_id", ignoreDuplicates: true })
      .select();
    if (error) throw error;
    return data ?? [];
  },
};

export const contradictionScanRepo = {
  /** pairKey → fingerprint of every pair already judged. */
  async scannedMap(userId: string): Promise<Map<string, string>> {
    const { data, error } = await getSupabaseClient()
      .from("contradiction_scan_pairs")
      .select("pair_key, fingerprint")
      .eq("user_id", userId);
    if (error) throw error;
    return new Map((data ?? []).map((row) => [row.pair_key, row.fingerprint]));
  },

  async record(rows: ScanInsert[]): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await getSupabaseClient()
      .from("contradiction_scan_pairs")
      .upsert(rows, { onConflict: "user_id,pair_key", ignoreDuplicates: false });
    if (error) throw error;
  },
};
