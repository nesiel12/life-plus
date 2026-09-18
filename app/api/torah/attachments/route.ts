import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/lib/api/sessionUser";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { isMediaTranscriptionConfigured } from "@/lib/ai";
import { entityAudioRepo } from "@/lib/db/entityAudio";
import {
  attachmentStoragePath,
  attachmentTitleFromFileName,
  extensionForMime,
  isAudioActive,
  toAttachmentView,
} from "@/lib/torah/attachments/audio";
import { resolveAudioEntity } from "@/lib/torah/attachments/entities";
import { advanceAudioTranscription } from "@/lib/torah/attachments/pipeline";
import { attachmentPlaybackUrl, createAttachmentUploadUrl } from "@/lib/torah/attachments/storage";
import { audioMimeType, MAX_AUDIO_BYTES, MAX_MEDIA_SECONDS } from "@/lib/torah/lessons/media";

export const runtime = "nodejs";
// A GET may run a transcription step after responding; the platform deadline
// has to cover the step, not just the response.
export const maxDuration = 120;

const ENTITY_TYPES = ["book", "rabbi", "lesson", "concept", "summary"] as const;

const createSchema = z.object({
  entityType: z.enum(ENTITY_TYPES),
  entityId: z.string().min(1).max(200),
  fileName: z.string().trim().min(1).max(260),
  mimeType: z.string().max(100).optional(),
  sizeBytes: z.number().int().positive(),
  durationSeconds: z.number().positive().max(MAX_MEDIA_SECONDS).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  source: z.enum(["upload", "recording"]).optional(),
});

/**
 * Everything attached to one entity, with playback URLs.
 *
 * POLLING IS ALSO A WORKER, exactly as on the lesson page: while a recording
 * is being transcribed the widget polls this route, and each poll schedules a
 * short pipeline run after the response is sent. The row lease makes
 * concurrent polls harmless, and the cron sweep finishes the job if the page
 * is closed.
 */
export async function GET(request: Request) {
  const auth = await requireSessionUser();
  if (auth.response) return auth.response;
  const { user } = auth;

  const url = new URL(request.url);
  const parsed = z
    .object({ entityType: z.enum(ENTITY_TYPES), entityId: z.string().min(1).max(200) })
    .safeParse({ entityType: url.searchParams.get("entityType"), entityId: url.searchParams.get("entityId") });
  if (!parsed.success) return NextResponse.json({ error: "בקשה לא תקינה." }, { status: 400 });

  const entity = await resolveAudioEntity(user.id, parsed.data.entityType, parsed.data.entityId);
  if (!entity) return NextResponse.json({ error: "הפריט לא נמצא." }, { status: 404 });

  const rows = await entityAudioRepo.listForEntity(user.id, parsed.data.entityType, parsed.data.entityId);
  const attachments = await Promise.all(
    rows.map(async (row) =>
      toAttachmentView(row, row.status === "uploading" ? null : await attachmentPlaybackUrl(row.storage_path))
    )
  );

  for (const row of rows) {
    if (isAudioActive(row.status)) {
      after(() => advanceAudioTranscription(row.id, { userId: user.id, budgetMs: 90_000 }).then(() => undefined));
    }
  }

  return NextResponse.json({ entity: { label: entity.label, href: entity.href }, attachments });
}

/**
 * Registers a recording and hands back a one-time upload URL.
 *
 * The browser uploads straight to storage — a 40 MB recording never passes
 * through a serverless function's body limit — and then confirms via
 * POST /api/torah/attachments/[id]/uploaded.
 */
export async function POST(request: Request) {
  const auth = await requireSessionUser({ key: "torah-attachments-create", limit: 30, windowMs: 10 * 60 * 1000 });
  if (auth.response) return auth.response;
  const { user } = auth;

  const parsed = await parseJsonBody(request, createSchema);
  if (parsed.error) return parsed.error;
  const input = parsed.data;

  // An id in a body is a claim: the entity must exist and be this user's.
  const entity = await resolveAudioEntity(user.id, input.entityType, input.entityId);
  if (!entity) return NextResponse.json({ error: "הפריט לא נמצא." }, { status: 404 });

  const mimeType = audioMimeType(input.mimeType, input.fileName);
  if (!mimeType) {
    return NextResponse.json({ error: "סוג הקובץ לא נתמך. אפשר להעלות MP3, M4A, WAV, OGG או FLAC." }, { status: 400 });
  }
  if (input.sizeBytes > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "הקובץ גדול מ-50MB. אפשר לדחוס אותו ל-MP3 באיכות 64kbps ולנסות שוב." }, { status: 413 });
  }

  const row = await entityAudioRepo.insert({
    user_id: user.id,
    entity_type: input.entityType,
    entity_id: input.entityId,
    title: input.title ?? attachmentTitleFromFileName(input.fileName),
    // Replaced below with the real path, which needs the row's id.
    storage_path: "",
    mime: mimeType,
    size_bytes: input.sizeBytes,
    duration_seconds: input.durationSeconds ? Math.round(input.durationSeconds) : null,
    source: input.source ?? "upload",
    status: "uploading",
  });

  const storagePath = attachmentStoragePath(user.id, row.id, extensionForMime(mimeType));
  try {
    const upload = await createAttachmentUploadUrl(storagePath);
    const saved = await entityAudioRepo.update(user.id, row.id, { storage_path: storagePath });
    return NextResponse.json(
      {
        attachment: toAttachmentView(saved),
        upload: { url: upload.signedUrl, mimeType },
        // The widget hides "תמלל הקלטה זו" when nothing can transcribe it.
        transcriptionAvailable: isMediaTranscriptionConfigured(),
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[attachments] upload URL failed:", err);
    await entityAudioRepo.remove(user.id, row.id).catch(() => undefined);
    return NextResponse.json({ error: "לא ניתן להתחיל את ההעלאה כרגע. נסה שוב." }, { status: 502 });
  }
}
