import "server-only";
import { getSupabaseClient } from "@/lib/supabase";
import type { Database, Json } from "@/types/database";

type ArticleExtractRow = Database["public"]["Tables"]["article_extracts"]["Row"];

// Not built on createUserScopedRepo, unlike every other repo in lib/db/ —
// this table deliberately has no user_id (see the migration's own comment:
// a fetched public webpage's extracted text is the same for every reader).
export const articleExtractsRepo = {
  async findByUrlHash(urlHash: string): Promise<ArticleExtractRow | null> {
    const { data, error } = await getSupabaseClient().from("article_extracts").select("*").eq("url_hash", urlHash).maybeSingle();
    if (error) throw error;
    return data;
  },

  async insert(input: {
    urlHash: string;
    sourceUrl: string;
    title: string | null;
    paragraphs: Json;
    keyParagraphIndices: Json;
    keyParagraphNotes: Json;
  }): Promise<ArticleExtractRow> {
    const { data, error } = await getSupabaseClient()
      .from("article_extracts")
      .insert({
        url_hash: input.urlHash,
        source_url: input.sourceUrl,
        title: input.title,
        paragraphs: input.paragraphs,
        key_paragraph_indices: input.keyParagraphIndices,
        key_paragraph_notes: input.keyParagraphNotes,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};
