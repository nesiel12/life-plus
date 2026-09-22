import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";
import { getSupabaseClient } from "@/lib/supabase";
import { review, type SrsGrade, type SrsState } from "@/lib/torah/srs";
import type { Database, SrsSourceTypeDb } from "@/types/database";

type CardRow = Database["public"]["Tables"]["srs_cards"]["Row"];
type CardInsert = Database["public"]["Tables"]["srs_cards"]["Insert"];

const base = createUserScopedRepo("srs_cards");
const reviewsBase = createUserScopedRepo("srs_reviews");

/** Row → the pure state lib/torah/srs.ts schedules against. */
export function toSrsState(row: CardRow): SrsState {
  return {
    easeFactor: row.ease_factor,
    intervalDays: row.interval_days,
    repetitions: row.repetitions,
    lapses: row.lapses,
    dueAt: new Date(row.due_at),
  };
}

export const srsCardsRepo = {
  ...base,

  list: (userId: string) => base.list(userId, { orderBy: "due_at", ascending: true }),

  /**
   * The cards to study now.
   *
   * Filtered and ordered in the database rather than by fetching the deck and
   * calling dueCards() on it: the partial index from the migration
   * (srs_cards_due_idx) answers exactly this query, and a user with a
   * thousand cards should not transfer all of them to find the twenty due.
   * lib/torah/srs.ts's dueCards() remains the one used on an already-loaded
   * deck, and the two agree by construction — same predicate, same ordering.
   */
  async listDue(userId: string, limit = 30, now: Date = new Date()): Promise<CardRow[]> {
    const { data, error } = await getSupabaseClient()
      .from("srs_cards")
      .select("*")
      .eq("user_id", userId)
      .is("suspended_at", null)
      .lte("due_at", now.toISOString())
      .order("due_at", { ascending: true })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  },

  /** Due cards, optionally from one lesson only. */
  async listDueFiltered(
    userId: string,
    filter: { lessonId?: string; limit?: number },
    now: Date = new Date()
  ): Promise<CardRow[]> {
    let query = getSupabaseClient()
      .from("srs_cards")
      .select("*")
      .eq("user_id", userId)
      .is("suspended_at", null)
      .lte("due_at", now.toISOString());
    if (filter.lessonId) query = query.eq("source_type", "lesson").eq("source_id", filter.lessonId);
    const { data, error } = await query.order("due_at", { ascending: true }).limit(filter.limit ?? 30);
    if (error) throw error;
    return data ?? [];
  },

  /**
   * Every card (due or not, but never suspended) from one polymorphic source —
   * the Learning lab's deck for a topic (source_type "learning_topic",
   * source_id the topic's id). Unlike listDueFiltered this is not limited to
   * what is due right now: the mastery index needs the whole deck's state
   * (lib/learning/mastery.ts deckProgress), not just today's queue.
   */
  async listBySource(userId: string, sourceType: SrsSourceTypeDb, sourceId: string): Promise<CardRow[]> {
    const { data, error } = await getSupabaseClient()
      .from("srs_cards")
      .select("*")
      .eq("user_id", userId)
      .eq("source_type", sourceType)
      .eq("source_id", sourceId)
      .is("suspended_at", null)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  /** The subset of listBySource that is actually due, soonest first. */
  async listDueBySource(
    userId: string,
    sourceType: SrsSourceTypeDb,
    sourceId: string,
    limit = 30,
    now: Date = new Date()
  ): Promise<CardRow[]> {
    const { data, error } = await getSupabaseClient()
      .from("srs_cards")
      .select("*")
      .eq("user_id", userId)
      .eq("source_type", sourceType)
      .eq("source_id", sourceId)
      .is("suspended_at", null)
      .lte("due_at", now.toISOString())
      .order("due_at", { ascending: true })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  },

  async listForChunk(userId: string, chunkId: string): Promise<CardRow[]> {
    const { data, error } = await getSupabaseClient()
      .from("srs_cards")
      .select("*")
      .eq("user_id", userId)
      .eq("chunk_id", chunkId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async insertMany(rows: CardInsert[]): Promise<CardRow[]> {
    if (rows.length === 0) return [];
    const { data, error } = await getSupabaseClient().from("srs_cards").insert(rows).select();
    if (error) throw error;
    return data ?? [];
  },

  /**
   * Applies one grade: advances the card's schedule and logs the review.
   *
   * The scheduling maths is not repeated here — it is lib/torah/srs.ts's
   * review(), which is pure and tested. This function is only the two writes,
   * which is the part that cannot be unit-tested without a database.
   *
   * The card is updated first. If the log insert then fails the user keeps
   * their scheduling (the thing that matters) and loses one row of history
   * (the thing that does not), rather than re-answering a card whose grade
   * silently did not stick.
   */
  async grade(
    userId: string,
    cardId: string,
    grade: SrsGrade,
    options: { durationMs?: number; now?: Date } = {}
  ): Promise<CardRow> {
    const now = options.now ?? new Date();

    const { data: current, error: readError } = await getSupabaseClient()
      .from("srs_cards")
      .select("*")
      .eq("id", cardId)
      .eq("user_id", userId)
      .maybeSingle();
    if (readError) throw readError;
    if (!current) throw new Error("Card not found or not owned by this user");

    const next = review(toSrsState(current), grade, now);

    const updated = await base.update(userId, cardId, {
      ease_factor: next.easeFactor,
      interval_days: next.intervalDays,
      repetitions: next.repetitions,
      lapses: next.lapses,
      due_at: next.dueAt.toISOString(),
      last_reviewed_at: now.toISOString(),
      last_grade: grade,
    });

    await reviewsBase.insert({
      user_id: userId,
      card_id: cardId,
      grade,
      interval_days: next.intervalDays,
      ease_factor: next.easeFactor,
      duration_ms: options.durationMs ?? null,
      reviewed_at: now.toISOString(),
    });

    return updated;
  },

  /** Retires a card without losing its review history. */
  suspend: (userId: string, cardId: string) =>
    base.update(userId, cardId, { suspended_at: new Date().toISOString() }),

  unsuspend: (userId: string, cardId: string) => base.update(userId, cardId, { suspended_at: null }),
};

export const srsReviewsRepo = {
  ...reviewsBase,
  list: (userId: string) => reviewsBase.list(userId, { orderBy: "reviewed_at", ascending: false }),
};
