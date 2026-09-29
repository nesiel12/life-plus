import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/lib/api/sessionUser";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { lessonsRepo } from "@/lib/db/lessons";
import { toLessonSummary } from "@/lib/torah/lessons/dto";
import { audioMimeType, MAX_AUDIO_BYTES } from "@/lib/torah/lessons/media";
import { createLessonUploadUrl, lessonMediaPath } from "@/lib/torah/lessons/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  fileName: z.string().trim().min(1).max(260),
  mimeType: z.string().max(100).optional(),
  sizeBytes: z.number().int().positive(),
  durationSeconds: z.number().positive().optional(),
});

/**
 * Last-resort manual fallback for a youtube lesson that failed even after the
 * automatic audio-extraction attempt in lib/torah/lessons/pipeline.ts (a
 * video YouTube itself won't serve to our own worker, exactly as it wouldn't
 * to Gemini). Converts the lesson into an ordinary audio upload — same
 * storage path and pipeline an audio lesson always takes — so the user can
 * finish processing themselves instead of staying stuck.
 *
 * Mirrors POST /api/torah/lessons (the "audio" branch): validates the file,
 * issues a one-time signed upload URL, and flips the row to `uploading`. The
 * browser then uploads directly to storage and confirms via
 * POST /api/torah/lessons/[id]/uploaded, which starts the pipeline as it
 * would for any audio lesson.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionUser({ key: "torah-lessons-audio-fallback", limit: 20, windowMs: 10 * 60 * 1000 });
  if (auth.response) return auth.response;
  const { user } = auth;
  const { id } = await context.params;

  const row = await lessonsRepo.get(user.id, id);
  if (!row) return NextResponse.json({ error: "השיעור לא נמצא." }, { status: 404 });
  if (row.kind !== "youtube" || row.status !== "failed") {
    return NextResponse.json({ lesson: toLessonSummary(row) });
  }

  const parsed = await parseJsonBody(request, bodySchema);
  if (parsed.error) return parsed.error;
  const input = parsed.data;

  const mimeType = audioMimeType(input.mimeType, input.fileName);
  if (!mimeType) {
    return NextResponse.json({ error: "זה לא קובץ שמע נתמך. אפשר להעלות MP3, M4A, WAV, OGG או FLAC." }, { status: 400 });
  }
  if (input.sizeBytes > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "הקובץ גדול מ-50MB. אפשר לדחוס אותו ל-MP3 באיכות 64kbps ולנסות שוב." }, { status: 413 });
  }

  const storagePath = lessonMediaPath(user.id, id, input.fileName);
  try {
    const upload = await createLessonUploadUrl(storagePath);
    const updated = await lessonsRepo.update(user.id, id, {
      kind: "audio",
      status: "uploading",
      storage_path: storagePath,
      media_mime: mimeType,
      media_size_bytes: input.sizeBytes,
      duration_seconds: input.durationSeconds ? Math.round(input.durationSeconds) : row.duration_seconds,
      error: null,
      attempts: 0,
      progress: {},
    });
    return NextResponse.json({ lesson: toLessonSummary(updated), upload: { url: upload.signedUrl, mimeType } });
  } catch (err) {
    console.error("[lessons] audio-fallback upload URL failed:", err);
    return NextResponse.json({ error: "לא ניתן להתחיל את ההעלאה כרגע. נסה שוב." }, { status: 502 });
  }
}
