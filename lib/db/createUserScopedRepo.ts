import "server-only";
import { getSupabaseClient } from "@/lib/supabase";
import type { Database } from "@/types/database";

// Covers every table shaped like (id uuid pk, user_id uuid, ...): people,
// moments, upcoming_events, knowledge_entries, goals, chat_messages, insights,
// books, rabbis, summaries, tasks, habits, habit_logs, transactions,
// manual_events, learning_topics, learning_resources, meals, workouts.
// Tables with a different shape (composite keys, single-row-per-user) get
// their own small module in lib/db/ instead of being forced through this.
type UserScopedTableName =
  | "people"
  | "moments"
  | "upcoming_events"
  | "knowledge_entries"
  | "goals"
  | "chat_messages"
  | "insights"
  | "books"
  | "rabbis"
  | "summaries"
  | "summary_sections"
  | "check_ins"
  | "tasks"
  | "habits"
  | "habit_logs"
  | "transactions"
  | "manual_events"
  | "learning_topics"
  | "learning_resources"
  | "meals"
  | "workouts"
  | "notifications"
  | "routine_blocks"
  // מרחב תורה — Knowledge Graph (20260916000000–000002). Every one of these
  // is (id uuid pk, user_id uuid, …), so they fit this factory as-is.
  // lesson_transcripts deliberately does not: it is keyed by lesson_id, and
  // lib/db/lessons.ts gives it its own accessor rather than bending the
  // factory around one table.
  | "kg_edges"
  | "concepts"
  | "concept_mentions"
  | "lessons"
  | "lesson_segments"
  | "lesson_sources"
  | "learning_chunks"
  | "practice_questions"
  | "practice_attempts"
  | "srs_cards"
  | "srs_reviews"
  | "study_tracks"
  | "study_track_items"
  | "havruta_threads"
  | "havruta_messages"
  | "contradiction_alerts"
  | "contradiction_scan_pairs"
  // מרחב תורה — universal audio + handwriting scanner (20260920000000).
  | "entity_audio"
  | "handwriting_scans"
  // UX overhaul (20260921000000).
  | "water_logs"
  | "practice_sessions"
  | "video_checkpoints"
  | "learning_roadmaps"
  // Learning OS (20260922000000).
  | "learning_books"
  | "learning_quotes"
  | "learning_quiz_attempts"
  // עוזר קולי — voice history (20260923000000).
  | "voice_sessions"
  | "voice_messages"
  // Masterclass & Gaming OS (20260924000000, 20260925000000, 20260926000000).
  | "learning_lesson_contents"
  | "learning_checkpoint_answers"
  | "pioneer_easter_egg_claims";

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

    /** One row by id, or null — scoped to the user like every other read. */
    async get(userId: string, id: string): Promise<Row | null> {
      const { data, error } = await from().select("*").eq("id", id).eq("user_id", userId).maybeSingle();
      if (error) throw error;
      return (data ?? null) as Row | null;
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
