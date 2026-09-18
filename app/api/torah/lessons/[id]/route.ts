import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/lib/api/sessionUser";
import { getSupabaseClient } from "@/lib/supabase";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { booksRepo } from "@/lib/db/books";
import { knowledgeEntriesRepo } from "@/lib/db/knowledgeEntries";
import { lessonsRepo, lessonSegmentsRepo, lessonSourcesRepo, lessonTranscriptsRepo } from "@/lib/db/lessons";
import { learningChunksRepo } from "@/lib/db/practice";
import { toChapterView, toChunkView, toLessonSummary, toSourceView } from "@/lib/torah/lessons/dto";
import { advanceLesson, matchLibraryBook } from "@/lib/torah/lessons/pipeline";
import { lessonPlaybackUrl, removeLessonMedia } from "@/lib/torah/lessons/storage";
import { parseStoredLines } from "@/lib/torah/lessons/transcript";
import type { LessonDetail } from "@/lib/torah/lessons/types";

export const runtime = "nodejs";
// The GET may run a pipeline step after responding (see below); the platform
// deadline has to cover the step, not just the response.
export const maxDuration = 120;

const ACTIVE = new Set(["pending", "transcribing", "analyzing"]);

/**
 * Everything the lesson page renders: media, transcript, chapters, sources,
 * learning chunks and processing progress.
 *
 * POLLING IS ALSO A WORKER. While a lesson is still processing, the page polls
 * this route; each poll schedules one short run of the pipeline after the
 * response is sent (next/server `after`). The row lease makes concurrent polls
 * harmless — only one gets the step — and the cron sweep finishes the job if
 * the user closes the page.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionUser();
  if (auth.response) return auth.response;
  const { user } = auth;
  const { id } = await context.params;

  const row = await lessonsRepo.get(user.id, id);
  if (!row) return NextResponse.json({ error: "השיעור לא נמצא." }, { status: 404 });

  const [transcript, segments, sources, chunks, books] = await Promise.all([
    lessonTranscriptsRepo.get(user.id, id),
    lessonSegmentsRepo.listForLesson(user.id, id),
    lessonSourcesRepo.listForLesson(user.id, id),
    learningChunksRepo.listForLesson(user.id, id),
    booksRepo.list(user.id),
  ]);

  // Re-match sources against the library as it is NOW: a book added after
  // the lesson was analysed links up without re-running anything.
  const sourceViews = sources.map((source) => {
    const view = toSourceView(source);
    if (!view.bookId || !books.some((b) => b.id === view.bookId)) {
      view.bookId = matchLibraryBook({ index: source.sefaria_index, heIndexTitle: source.he_index_title }, books)?.id ?? null;
    }
    return view;
  });

  const mediaUrl =
    row.kind === "audio" && row.storage_path && row.status !== "uploading" ? await lessonPlaybackUrl(row.storage_path) : row.source_url;

  const detail: LessonDetail = {
    ...toLessonSummary(row),
    keyPoints: Array.isArray(row.key_points) ? (row.key_points as string[]) : [],
    mediaUrl,
    knowledgeEntryId: row.knowledge_entry_id,
    transcript: parseStoredLines(transcript?.lines),
    transcriptProvider: transcript?.provider ?? null,
    chapters: segments.map(toChapterView),
    sources: sourceViews,
    chunks: chunks.map(toChunkView),
  };

  if (ACTIVE.has(row.status)) {
    after(() => advanceLesson(id, { userId: user.id, budgetMs: 90_000 }).then(() => undefined));
  }

  return NextResponse.json({ lesson: detail });
}

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  bookId: z.string().uuid().nullable().optional(),
  rabbiId: z.string().uuid().nullable().optional(),
  knowledgeEntryId: z.string().uuid().nullable().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionUser();
  if (auth.response) return auth.response;
  const { user } = auth;
  const { id } = await context.params;

  const parsed = await parseJsonBody(request, patchSchema);
  if (parsed.error) return parsed.error;

  const row = await lessonsRepo.get(user.id, id);
  if (!row) return NextResponse.json({ error: "השיעור לא נמצא." }, { status: 404 });

  const { title, bookId, rabbiId, knowledgeEntryId } = parsed.data;
  if (bookId && !(await booksRepo.get(user.id, bookId))) {
    return NextResponse.json({ error: "הספר לא נמצא." }, { status: 404 });
  }
  if (knowledgeEntryId) {
    const entries = await knowledgeEntriesRepo.list(user.id);
    if (!entries.some((e) => e.id === knowledgeEntryId)) {
      return NextResponse.json({ error: "הרשומה לא נמצאה." }, { status: 404 });
    }
  }

  const updated = await lessonsRepo.update(user.id, id, {
    ...(title !== undefined ? { title } : {}),
    ...(bookId !== undefined ? { book_id: bookId } : {}),
    ...(rabbiId !== undefined ? { rabbi_id: rabbiId } : {}),
    ...(knowledgeEntryId !== undefined ? { knowledge_entry_id: knowledgeEntryId } : {}),
  });
  return NextResponse.json({ lesson: toLessonSummary(updated) });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionUser();
  if (auth.response) return auth.response;
  const { user } = auth;
  const { id } = await context.params;

  const row = await lessonsRepo.get(user.id, id);
  if (!row) return NextResponse.json({ error: "השיעור לא נמצא." }, { status: 404 });

  // Row first: transcripts, chapters, sources, chunks and questions cascade.
  // The stored audio goes after — an orphaned file costs storage; a row
  // pointing at a deleted file costs a broken page.
  await lessonsRepo.remove(user.id, id);
  // Flashcards reference their lesson by (source_type, source_id), with no
  // foreign key to cascade through; left behind they would keep appearing in
  // the review queue under a lesson that no longer exists.
  await getSupabaseClient()
    .from("srs_cards")
    .delete()
    .eq("user_id", user.id)
    .eq("source_type", "lesson")
    .eq("source_id", id);
  // Graph edges are polymorphic too (lesson --quotes--> book): same reason.
  await getSupabaseClient().from("kg_edges").delete().eq("user_id", user.id).eq("from_type", "lesson").eq("from_id", id);
  if (row.storage_path) await removeLessonMedia(row.storage_path).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
