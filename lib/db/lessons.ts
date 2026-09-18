import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";
import { getSupabaseClient } from "@/lib/supabase";
import type { Database, LessonStatusDb } from "@/types/database";

type LessonRow = Database["public"]["Tables"]["lessons"]["Row"];
type TranscriptRow = Database["public"]["Tables"]["lesson_transcripts"]["Row"];
type TranscriptInsert = Database["public"]["Tables"]["lesson_transcripts"]["Insert"];
type SegmentInsert = Database["public"]["Tables"]["lesson_segments"]["Insert"];
type SegmentRow = Database["public"]["Tables"]["lesson_segments"]["Row"];
type SourceInsert = Database["public"]["Tables"]["lesson_sources"]["Insert"];
type SourceRow = Database["public"]["Tables"]["lesson_sources"]["Row"];

const base = createUserScopedRepo("lessons");
type LessonUpdate = Database["public"]["Tables"]["lessons"]["Update"];

export const lessonsRepo = {
  ...base,

  /**
   * Takes the lease for one pipeline step, atomically (claim_lesson_step in
   * 20260918000000). Null when another worker holds it, the lesson is not in
   * an active state, or it is paused. `userId` null = the cross-user sweep.
   */
  async claimStep(lessonId: string, userId: string | null, leaseSeconds: number): Promise<LessonRow | null> {
    const { data, error } = await getSupabaseClient().rpc("claim_lesson_step", {
      p_lesson_id: lessonId,
      p_user_id: userId,
      p_lease_seconds: leaseSeconds,
    });
    if (error) throw error;
    return (data as LessonRow[] | null)?.[0] ?? null;
  },

  /** Active lessons with a free lease, oldest first — the sweep's work list. */
  async listClaimable(limit: number): Promise<{ id: string; user_id: string }[]> {
    const { data, error } = await getSupabaseClient().rpc("list_claimable_lessons", { p_limit: limit });
    if (error) throw error;
    return data ?? [];
  },

  /** Ends a step: writes its results and gives the lease back. */
  async release(userId: string, lessonId: string, patch: LessonUpdate): Promise<LessonRow> {
    return base.update(userId, lessonId, { ...patch, lease_until: null });
  },

  list: (userId: string) => base.list(userId, { orderBy: "lesson_date", ascending: false }),

  async get(userId: string, lessonId: string): Promise<LessonRow | null> {
    const { data, error } = await getSupabaseClient()
      .from("lessons")
      .select("*")
      .eq("id", lessonId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  /**
   * Moves a lesson through its processing states.
   *
   * One method rather than callers patching `status` directly, so the two
   * invariants hold everywhere: reaching a non-failed state clears any
   * previous `error`, and reaching 'failed' always records one. A stale error
   * left on a row that has since succeeded is how a working lesson ends up
   * permanently displaying a red banner.
   */
  async setStatus(
    userId: string,
    lessonId: string,
    status: LessonStatusDb,
    error?: string
  ): Promise<LessonRow> {
    return base.update(userId, lessonId, {
      status,
      error: status === "failed" ? (error ?? "העיבוד נכשל.") : null,
    });
  },
};

/**
 * Transcripts are keyed by lesson_id, not by their own id, so they get this
 * small module instead of createUserScopedRepo — which assumes an `id`
 * column and a user_id filter on every call.
 */
export const lessonTranscriptsRepo = {
  async get(userId: string, lessonId: string): Promise<TranscriptRow | null> {
    const { data, error } = await getSupabaseClient()
      .from("lesson_transcripts")
      .select("*")
      .eq("lesson_id", lessonId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  /** Re-transcribing replaces; there is only ever one transcript per lesson. */
  async save(row: TranscriptInsert): Promise<TranscriptRow> {
    const { data, error } = await getSupabaseClient()
      .from("lesson_transcripts")
      .upsert(row, { onConflict: "lesson_id" })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};

const segmentsBase = createUserScopedRepo("lesson_segments");

export const lessonSegmentsRepo = {
  ...segmentsBase,

  async listForLesson(userId: string, lessonId: string): Promise<SegmentRow[]> {
    const { data, error } = await getSupabaseClient()
      .from("lesson_segments")
      .select("*")
      .eq("user_id", userId)
      .eq("lesson_id", lessonId)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  /**
   * Replaces a lesson's segments wholesale.
   *
   * Segmentation is a single AI pass over the whole transcript, so its output
   * is one coherent set — merging a new pass into an old one interleaves two
   * models' opinions about where the topics change and produces a timeline
   * that matches neither.
   */
  async replaceForLesson(userId: string, lessonId: string, rows: SegmentInsert[]): Promise<SegmentRow[]> {
    const client = getSupabaseClient();

    const { error: deleteError } = await client
      .from("lesson_segments")
      .delete()
      .eq("user_id", userId)
      .eq("lesson_id", lessonId);
    if (deleteError) throw deleteError;

    if (rows.length === 0) return [];

    const { data, error } = await client.from("lesson_segments").insert(rows).select();
    if (error) throw error;
    return data ?? [];
  },
};

const sourcesBase = createUserScopedRepo("lesson_sources");

export const lessonSourcesRepo = {
  ...sourcesBase,

  async listForLesson(userId: string, lessonId: string): Promise<SourceRow[]> {
    const { data, error } = await getSupabaseClient()
      .from("lesson_sources")
      .select("*")
      .eq("user_id", userId)
      .eq("lesson_id", lessonId)
      .order("at_seconds", { ascending: true, nullsFirst: false });
    if (error) throw error;
    return data ?? [];
  },

  /**
   * Idempotent write, against the migration's unique index.
   *
   * Unlike segments, citations survive re-extraction as individual facts: the
   * same pasuk quoted at the same timestamp is the same source however many
   * times the pass runs, and a user who has already linked it to a book in
   * their library should not lose that link to a re-run.
   */
  async upsertMany(rows: SourceInsert[]): Promise<SourceRow[]> {
    if (rows.length === 0) return [];
    const { data, error } = await getSupabaseClient()
      .from("lesson_sources")
      .upsert(rows, {
        onConflict: "user_id,lesson_id,raw_citation,at_seconds",
        ignoreDuplicates: false,
      })
      .select();
    if (error) throw error;
    return data ?? [];
  },

  /**
   * Replaces a lesson's sources — on (re)analysis only. The analysis is one
   * coherent pass, and every field a user can influence (the library link) is
   * recomputed from the library on read, so nothing of theirs is lost.
   */
  async replaceForLesson(userId: string, lessonId: string, rows: SourceInsert[]): Promise<SourceRow[]> {
    const client = getSupabaseClient();
    const { error: deleteError } = await client.from("lesson_sources").delete().eq("user_id", userId).eq("lesson_id", lessonId);
    if (deleteError) throw deleteError;
    if (rows.length === 0) return [];
    const { data, error } = await client.from("lesson_sources").insert(rows).select();
    if (error) throw error;
    return data ?? [];
  },

  /** Links a citation to a book once the user adds that book to their library. */
  async resolveToBook(userId: string, sourceId: string, bookId: string): Promise<SourceRow> {
    return sourcesBase.update(userId, sourceId, { resolved_book_id: bookId });
  },
};
