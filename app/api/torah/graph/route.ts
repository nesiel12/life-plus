import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api/sessionUser";
import { booksRepo } from "@/lib/db/books";
import { conceptsRepo } from "@/lib/db/concepts";
import { kgEdgesRepo, toKgEdge } from "@/lib/db/kgEdges";
import { lessonsRepo } from "@/lib/db/lessons";
import { rabbisRepo } from "@/lib/db/rabbis";
import { getSupabaseClient } from "@/lib/supabase";
import { buildMapGraph } from "@/lib/torah/graphMap";

export const runtime = "nodejs";

/**
 * GET — the learner's whole Torah knowledge map.
 *
 * Built server-side from rows (lib/torah/graphMap.ts), filtered and laid out
 * in the browser: filter changes are instant and never cost a round trip.
 * One user's graph is hundreds of nodes; the client caps what it draws.
 */
export async function GET() {
  const auth = await requireSessionUser({ key: "torah-graph", limit: 60, windowMs: 5 * 60 * 1000 });
  if (auth.response) return auth.response;
  const userId = auth.user.id;
  const client = getSupabaseClient();

  const [books, rabbis, lessons, concepts, edges, mentions, sources] = await Promise.all([
    booksRepo.list(userId),
    rabbisRepo.list(userId),
    lessonsRepo.list(userId),
    conceptsRepo.list(userId),
    kgEdgesRepo.list(userId),
    client.from("concept_mentions").select("concept_id, source_type, source_id").eq("user_id", userId),
    client.from("lesson_sources").select("lesson_id, resolved_book_id").eq("user_id", userId).not("resolved_book_id", "is", null),
  ]);
  if (mentions.error) throw mentions.error;
  if (sources.error) throw sources.error;

  const graph = buildMapGraph({
    books: books.map((b) => ({
      id: b.id,
      title: b.title,
      hebrewTitle: b.hebrew_title,
      author: b.author,
      category: b.category,
      authorRabbiId: b.author_rabbi_id,
      description: b.description,
    })),
    rabbis: rabbis.map((r) => ({
      id: r.id,
      name: r.name,
      hebrewName: r.hebrew_name,
      era: r.era,
      birthYear: r.birth_year,
      deathYear: r.death_year,
      isContemporary: r.is_contemporary,
      bio: r.bio,
    })),
    lessons: lessons
      .filter((l) => l.status !== "uploading")
      .map((l) => ({ id: l.id, title: l.title, bookId: l.book_id, rabbiId: l.rabbi_id, speaker: l.speaker, status: l.status, summary: l.summary })),
    concepts: concepts.map((c) => ({ id: c.id, term: c.term, mentionCount: c.mention_count, definition: c.definition })),
    edges: edges.map(toKgEdge),
    conceptMentions: (mentions.data ?? []).map((m) => ({ conceptId: m.concept_id, sourceType: m.source_type, sourceId: m.source_id })),
    lessonBookSources: (sources.data ?? [])
      .filter((s): s is { lesson_id: string; resolved_book_id: string } => Boolean(s.resolved_book_id))
      .map((s) => ({ lessonId: s.lesson_id, bookId: s.resolved_book_id })),
  });

  return NextResponse.json(graph);
}
