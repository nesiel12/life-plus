import "server-only";
import { getSupabaseClient } from "@/lib/supabase";
import type { Database } from "@/types/database";

// Covers every table shaped like (id uuid pk, user_id uuid, ...): people,
// moments, upcoming_events, knowledge_entries, goals, chat_messages, insights.
// Tables with a different shape (composite keys, single-row-per-user) get
// their own small module in lib/db/ instead of being forced through this.
type UserScopedTableName =
  | "people"
  | "moments"
  | "upcoming_events"
  | "knowledge_entries"
  | "goals"
  | "chat_messages"
  | "insights";

export function createUserScopedRepo<T extends UserScopedTableName>(table: T) {
  type Row = Database["public"]["Tables"][T]["Row"];
  type Insert = Database["public"]["Tables"][T]["Insert"];
  type Update = Database["public"]["Tables"][T]["Update"];

  // Supabase's generated client can't narrow column types when the table name
  // is a generic parameter rather than a literal, so the query chain below is
  // typed as `any` internally. The function signatures around it (Row/Insert/
  // Update, derived from the Database type) are what actually keep every call
  // site type-safe — this cast is contained to this one file.
  const from = () => getSupabaseClient().from(table) as any; // eslint-disable-line @typescript-eslint/no-explicit-any

  return {
    async list(
      userId: string,
      options?: { orderBy?: string; ascending?: boolean }
    ): Promise<Row[]> {
      let query = from().select("*").eq("user_id", userId);
      if (options?.orderBy) {
        query = query.order(options.orderBy, { ascending: options.ascending ?? false });
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Row[];
    },

    async insert(row: Insert): Promise<Row> {
      const { data, error } = await from().insert(row).select().single();
      if (error) throw error;
      return data as Row;
    },

    // userId is required (not optional) so ownership is always enforced —
    // a caller cannot accidentally update/delete a row without proving it
    // belongs to the user making the request.
    async update(userId: string, id: string, patch: Update): Promise<Row> {
      const { data, error } = await from()
        .update(patch)
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();
      if (error) throw error;
      return data as Row;
    },

    async remove(userId: string, id: string): Promise<void> {
      const { error } = await from().delete().eq("id", id).eq("user_id", userId);
      if (error) throw error;
    },
  };
}
