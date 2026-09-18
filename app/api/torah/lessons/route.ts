import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/lib/api/sessionUser";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { booksRepo } from "@/lib/db/books";
import { rabbisRepo } from "@/lib/db/rabbis";
import { lessonsRepo } from "@/lib/db/lessons";
import { isMediaTranscriptionConfigured } from "@/lib/ai";
import { toLessonSummary } from "@/lib/torah/lessons/dto";
import { audioMimeType, canonicalYoutubeUrl, MAX_AUDIO_BYTES, MAX_MEDIA_SECONDS } from "@/lib/torah/lessons/media";
import { advanceLesson } from "@/lib/torah/lessons/pipeline";
import { createLessonUploadUrl, lessonMediaPath } from "@/lib/torah/lessons/storage";
import { youtubeVideoDetails } from "@/lib/torah/sources/youtube";
import { youtubeVideoId } from "@/lib/learning/youtube";

export const runtime = "nodejs";
export const maxDuration = 120;

const anchors = {
  title: z.string().trim().min(1).max(200).optional(),
  bookId: z.string().uuid().optional(),
  rabbiId: z.string().uuid().optional(),
};

const createSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("youtube"), url: z.string().trim().min(5).max(500), ...anchors }),
  z.object({
    kind: z.literal("audio"),
    fileName: z.string().trim().min(1).max(260),
    mimeType: z.string().max(100).optional(),
    sizeBytes: z.number().int().positive(),
    // Read by the browser from the file's own metadata; used to plan
    // transcription windows. Optional — the worker can estimate.
    durationSeconds: z.number().positive().max(MAX_MEDIA_SECONDS).optional(),
    ...anchors,
  }),
]);

/** The lessons list for the שיעורים tab. Light rows — no transcripts. */
export async function GET() {
  const auth = await requireSessionUser();
  if (auth.response) return auth.response;
  const rows = await lessonsRepo.list(auth.user.id);
  return NextResponse.json({ lessons: rows.map(toLessonSummary) });
}

/**
 * Creates a lesson. Never transcribes — see lib/torah/lessons/pipeline.ts.
 *
 *   YouTube: validates the link, reads title/channel/duration, creates the row
 *   as `pending`, and starts the first step after the response is sent.
 *
 *   Audio: validates type and size, creates the row as `uploading`, and returns
 *   a one-time signed upload URL. The browser uploads straight to storage —
 *   a 40 MB shiur never passes through a serverless function's body limit —
 *   and then confirms via POST /api/torah/lessons/[id]/uploaded.
 */
export async function POST(request: Request) {
  const auth = await requireSessionUser({ key: "torah-lessons-create", limit: 20, windowMs: 10 * 60 * 1000 });
  if (auth.response) return auth.response;
  const { user } = auth;

  const parsed = await parseJsonBody(request, createSchema);
  if (parsed.error) return parsed.error;
  const input = parsed.data;

  if (!isMediaTranscriptionConfigured() && input.kind === "audio") {
    return NextResponse.json({ error: "אין מפתח Gemini מחובר, ולכן אי אפשר לתמלל קבצי שמע." }, { status: 503 });
  }

  // Anchors must be the user's own rows — ids from the client are just claims.
  if (input.bookId && !(await booksRepo.get(user.id, input.bookId))) {
    return NextResponse.json({ error: "הספר לא נמצא." }, { status: 404 });
  }
  if (input.rabbiId && !(await rabbisRepo.get(user.id, input.rabbiId))) {
    return NextResponse.json({ error: "הרב לא נמצא." }, { status: 404 });
  }

  if (input.kind === "youtube") {
    const url = canonicalYoutubeUrl(input.url);
    const videoId = url ? youtubeVideoId(url) : null;
    if (!url || !videoId) {
      return NextResponse.json({ error: "זה לא נראה כמו קישור YouTube תקין." }, { status: 400 });
    }
    const details = await youtubeVideoDetails(videoId).catch(() => null);
    if (!details) {
      return NextResponse.json({ error: "הסרטון לא נמצא — ייתכן שהוא פרטי או הוסר." }, { status: 404 });
    }
    if (details.durationSeconds && details.durationSeconds > MAX_MEDIA_SECONDS) {
      return NextResponse.json({ error: "הסרטון ארוך מדי (עד 4 שעות)." }, { status: 400 });
    }

    const row = await lessonsRepo.insert({
      user_id: user.id,
      title: input.title ?? details.title,
      kind: "youtube",
      source_url: url,
      speaker: details.channelTitle ?? null,
      duration_seconds: details.durationSeconds,
      status: "pending",
      book_id: input.bookId ?? null,
      rabbi_id: input.rabbiId ?? null,
    });
    after(() => advanceLesson(row.id, { userId: user.id, budgetMs: 90_000 }).then(() => undefined));
    return NextResponse.json({ lesson: toLessonSummary(row) }, { status: 201 });
  }

  const mimeType = audioMimeType(input.mimeType, input.fileName);
  if (!mimeType) {
    return NextResponse.json({ error: "סוג הקובץ לא נתמך. אפשר להעלות MP3, M4A, WAV, OGG או FLAC." }, { status: 400 });
  }
  if (input.sizeBytes > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "הקובץ גדול מ-50MB. אפשר לדחוס אותו ל-MP3 באיכות 64kbps ולנסות שוב." }, { status: 413 });
  }

  const title = input.title ?? input.fileName.replace(/\.[^.]+$/, "").slice(0, 200);
  const row = await lessonsRepo.insert({
    user_id: user.id,
    title,
    kind: "audio",
    status: "uploading",
    media_mime: mimeType,
    media_size_bytes: input.sizeBytes,
    duration_seconds: input.durationSeconds ? Math.round(input.durationSeconds) : null,
    book_id: input.bookId ?? null,
    rabbi_id: input.rabbiId ?? null,
  });

  const storagePath = lessonMediaPath(user.id, row.id, input.fileName);
  try {
    const upload = await createLessonUploadUrl(storagePath);
    const saved = await lessonsRepo.update(user.id, row.id, { storage_path: storagePath });
    return NextResponse.json({ lesson: toLessonSummary(saved), upload: { url: upload.signedUrl, mimeType } }, { status: 201 });
  } catch (err) {
    console.error("[lessons] upload URL failed:", err);
    await lessonsRepo.remove(user.id, row.id).catch(() => undefined);
    return NextResponse.json({ error: "לא ניתן להתחיל את ההעלאה כרגע. נסה שוב." }, { status: 502 });
  }
}
