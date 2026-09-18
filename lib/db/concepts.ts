import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";
import { getSupabaseClient } from "@/lib/supabase";
import { normalizeTerm } from "@/lib/torah/normalizeTerm";
import type { ConceptSourceTypeDb, Database } from "@/types/database";

type ConceptRow = Database["public"]["Tables"]["concepts"]["Row"];
type MentionRow = Database["public"]["Tables"]["concept_mentions"]["Row"];

const base = createUserScopedRepo("concepts");
const mentionsBase = createUserScopedRepo("concept_mentions");

export interface MentionInput {
  term: string;
  sourceType: ConceptSourceTypeDb;
  sourceId: string;
  excerpt?: string;
  atSeconds?: number;
}

export const conceptsRepo = {
  ...base,

  /** Most-mentioned first — the glossary's own ordering. */
  list: (userId: string) => base.list(userId, { orderBy: "mention_count", ascending: false }),

  async findByTerm(userId: string, term: string): Promise<ConceptRow | null> {
    const { data, error } = await getSupabaseClient()
      .from("concepts")
      .select("*")
      .eq("user_id", userId)
      .eq("normalized_term", normalizeTerm(term))
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  /**
   * Finds the concept for a term, creating it if this is its first sighting.
   *
   * The glossary's whole premise — one page per idea, however many places it
   * was written — lives in this one function and in the unique index behind
   * it. On a conflict the existing row is returned rather than overwritten,
   * so a definition the user has edited is never replaced by a later
   * AI-generated one.
   */
  async ensure(userId: string, term: string, definition?: string): Promise<ConceptRow> {
    const existing = await this.findByTerm(userId, term);
    if (existing) return existing;

    const { data, error } = await getSupabaseClient()
      .from("concepts")
      .upsert(
        {
          user_id: userId,
          term: term.trim(),
          normalized_term: normalizeTerm(term),
          definition: definition ?? null,
        },
        { onConflict: "user_id,normalized_term", ignoreDuplicates: false }
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};

export const conceptMentionsRepo = {
  ...mentionsBase,

  async listForConcept(userId: string, conceptId: string): Promise<MentionRow[]> {
    const { data, error } = await getSupabaseClient()
      .from("concept_mentions")
      .select("*")
      .eq("user_id", userId)
      .eq("concept_id", conceptId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  /**
   * Records where a concept was mentioned, and keeps the denormalised count
   * on `concepts` honest.
   *
   * The count is recomputed from the mentions table rather than incremented,
   * because the insert is an upsert: re-scanning a document that already had
   * this mention must not bump the counter a second time, and an increment
   * has no way to know whether the row was new.
   */
  async record(userId: string, conceptId: string, mention: Omit<MentionInput, "term">): Promise<void> {
    const client = getSupabaseClient();

    const { error: upsertError } = await client.from("concept_mentions").upsert(
      {
        user_id: userId,
        concept_id: conceptId,
        source_type: mention.sourceType,
        source_id: mention.sourceId,
        excerpt: mention.excerpt ?? null,
        at_seconds: mention.atSeconds ?? null,
      },
      { onConflict: "user_id,concept_id,source_type,source_id,at_seconds", ignoreDuplicates: false }
    );
    if (upsertError) throw upsertError;

    const { count, error: countError } = await client
      .from("concept_mentions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("concept_id", conceptId);
    if (countError) throw countError;

    const { error: updateError } = await client
      .from("concepts")
      .update({ mention_count: count ?? 0, last_seen_at: new Date().toISOString() })
      .eq("id", conceptId)
      .eq("user_id", userId);
    if (updateError) throw updateError;
  },
};
