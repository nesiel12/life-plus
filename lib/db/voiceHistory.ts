import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";
import { getSupabaseClient } from "@/lib/supabase";
import type { Database } from "@/types/database";

type Tables = Database["public"]["Tables"];
type SessionRow = Tables["voice_sessions"]["Row"];
type MessageRow = Tables["voice_messages"]["Row"];
type MessageInsert = Tables["voice_messages"]["Insert"];

const sessions = createUserScopedRepo("voice_sessions");
const messages = createUserScopedRepo("voice_messages");

export const voiceSessionsRepo = {
  ...sessions,

  async listRecent(userId: string, limit = 20): Promise<SessionRow[]> {
    const { data, error } = await getSupabaseClient()
      .from("voice_sessions")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  },

  /** Sets the title once, from the session's first user turn — never overwrites a title that's already there. */
  async setTitleIfEmpty(userId: string, sessionId: string, title: string): Promise<void> {
    const { error } = await getSupabaseClient()
      .from("voice_sessions")
      .update({ title })
      .eq("id", sessionId)
      .eq("user_id", userId)
      .is("title", null);
    if (error) throw error;
  },

  /**
   * Bumps updated_at so listRecent reflects the last turn, not just session
   * creation. Set explicitly rather than relying on an empty-patch update to
   * trigger voice_sessions_set_updated_at — an update with no changed
   * columns is a case PostgREST need not accept, so this never depends on it.
   */
  touch(userId: string, sessionId: string): Promise<SessionRow> {
    return sessions.update(userId, sessionId, { updated_at: new Date().toISOString() });
  },
};

export const voiceMessagesRepo = {
  ...messages,

  async listForSession(userId: string, sessionId: string): Promise<MessageRow[]> {
    const { data, error } = await getSupabaseClient()
      .from("voice_messages")
      .select("*")
      .eq("user_id", userId)
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async insertMany(rows: MessageInsert[]): Promise<MessageRow[]> {
    if (rows.length === 0) return [];
    const { data, error } = await getSupabaseClient().from("voice_messages").insert(rows).select();
    if (error) throw error;
    return data ?? [];
  },
};
