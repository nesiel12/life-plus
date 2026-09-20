import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";
import { getSupabaseClient } from "@/lib/supabase";
import type { Database } from "@/types/database";

// Data access for "לתרגל": learning chunks, practice questions and attempts,
// plus the narrow history reads the progress stats are computed from.

type ChunkRow = Database["public"]["Tables"]["learning_chunks"]["Row"];
type ChunkInsert = Database["public"]["Tables"]["learning_chunks"]["Insert"];
type QuestionRow = Database["public"]["Tables"]["practice_questions"]["Row"];
type QuestionInsert = Database["public"]["Tables"]["practice_questions"]["Insert"];
type AttemptRow = Database["public"]["Tables"]["practice_attempts"]["Row"];
type CardRow = Database["public"]["Tables"]["srs_cards"]["Row"];

const chunksBase = createUserScopedRepo("learning_chunks");
const questionsBase = createUserScopedRepo("practice_questions");
const attemptsBase = createUserScopedRepo("practice_attempts");

export const learningChunksRepo = {
  ...chunksBase,

  async listForLesson(userId: string, lessonId: string): Promise<ChunkRow[]> {
    const { data, error } = await getSupabaseClient()
      .from("learning_chunks")
      .select("*")
      .eq("user_id", userId)
      .eq("lesson_id", lessonId)
      .order("ordinal", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  /**
   * Replaces a lesson's chunks — only ever on (re)analysis. A lesson's practice
   * questions hang off its chunks and are removed with them (ON DELETE
   * CASCADE): questions about a chunk that no longer exists would point at
   * text the user can no longer see. Flashcards survive (chunk_id → null).
   */
  async replaceForLesson(userId: string, lessonId: string, rows: ChunkInsert[]): Promise<ChunkRow[]> {
    const client = getSupabaseClient();
    const { error: deleteError } = await client.from("learning_chunks").delete().eq("user_id", userId).eq("lesson_id", lessonId);
    if (deleteError) throw deleteError;
    if (rows.length === 0) return [];
    const { data, error } = await client.from("learning_chunks").insert(rows).select();
    if (error) throw error;
    return (data ?? []).sort((a, b) => a.ordinal - b.ordinal);
  },

  /** Marks a part done; idempotent — the first completion time is kept. */
  async complete(userId: string, chunkId: string): Promise<ChunkRow> {
    const current = await chunksBase.get(userId, chunkId);
    if (!current) throw new Error("Chunk not found");
    if (current.completed_at) return current;
    return chunksBase.update(userId, chunkId, { completed_at: new Date().toISOString() });
  },

  async countCompleted(userId: string): Promise<number> {
    const { count, error } = await getSupabaseClient()
      .from("learning_chunks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .not("completed_at", "is", null);
    if (error) throw error;
    return count ?? 0;
  },
};

export const practiceQuestionsRepo = {
  ...questionsBase,

  async listForChunk(userId: string, chunkId: string): Promise<QuestionRow[]> {
    const { data, error } = await getSupabaseClient()
      .from("practice_questions")
      .select("*")
      .eq("user_id", userId)
      .eq("chunk_id", chunkId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async insertMany(rows: QuestionInsert[]): Promise<QuestionRow[]> {
    if (rows.length === 0) return [];
    const { data, error } = await getSupabaseClient().from("practice_questions").insert(rows).select();
    if (error) throw error;
    return data ?? [];
  },
};

export const practiceAttemptsRepo = {
  ...attemptsBase,

  async listForQuestions(userId: string, questionIds: string[]): Promise<AttemptRow[]> {
    if (questionIds.length === 0) return [];
    const { data, error } = await getSupabaseClient()
      .from("practice_attempts")
      .select("*")
      .eq("user_id", userId)
      .in("question_id", questionIds)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  /** Score and time only — what the progress stats need, for every attempt. */
  async history(userId: string): Promise<Pick<AttemptRow, "score" | "created_at">[]> {
    const { data, error } = await getSupabaseClient()
      .from("practice_attempts")
      .select("score, created_at")
      .eq("user_id", userId);
    if (error) throw error;
    return data ?? [];
  },
};

/** Card state and review history for the stats, without card text. */
export const practiceHistoryRepo = {
  async cardStates(
    userId: string,
    filter: { lessonId?: string } = {}
  ): Promise<Pick<CardRow, "repetitions" | "interval_days" | "due_at" | "suspended_at">[]> {
    let query = getSupabaseClient()
      .from("srs_cards")
      .select("repetitions, interval_days, due_at, suspended_at")
      .eq("user_id", userId);
    if (filter.lessonId) query = query.eq("source_type", "lesson").eq("source_id", filter.lessonId);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },

  async reviews(userId: string): Promise<{ grade: number; reviewed_at: string }[]> {
    const { data, error } = await getSupabaseClient()
      .from("srs_reviews")
      .select("grade, reviewed_at")
      .eq("user_id", userId);
    if (error) throw error;
    return data ?? [];
  },
};

const sessionsBase = createUserScopedRepo("practice_sessions");

/** Finished "קרב חברותא" sessions — history, from which bonus XP is derived. */
export const practiceSessionsRepo = {
  ...sessionsBase,

  async history(userId: string): Promise<{ bonus_xp: number; max_combo: number; ended_at: string }[]> {
    const { data, error } = await getSupabaseClient()
      .from("practice_sessions")
      .select("bonus_xp, max_combo, ended_at")
      .eq("user_id", userId);
    if (error) throw error;
    return data ?? [];
  },
};
