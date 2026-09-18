import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/lib/api/sessionUser";
import { isMediaTranscriptionConfigured } from "@/lib/ai";
import { entityAudioRepo } from "@/lib/db/entityAudio";
import { toAttachmentView } from "@/lib/torah/attachments/audio";
import { advanceAudioTranscription } from "@/lib/torah/attachments/pipeline";
import { attachmentPlaybackUrl, attachmentSize } from "@/lib/torah/attachments/storage";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({ transcribe: z.boolean().optional() });

/**
 * The browser finished uploading: verify the object really exists and move the
 * recording from `uploading` to `stored`.
 *
 * Verified server-side rather than trusting "done" from the client — a tab
 * closed mid-upload must not leave a row whose player points at nothing.
 *
 * `transcribe: true` starts transcription in the same call, for the learner
 * who pressed "העלה ותמלל" rather than just attaching the file.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionUser({ key: "torah-attachments-uploaded", limit: 40, windowMs: 10 * 60 * 1000 });
  if (auth.response) return auth.response;
  const { user } = auth;
  const { id } = await context.params;

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  const transcribe = parsed.success ? Boolean(parsed.data.transcribe) : false;

  const row = await entityAudioRepo.get(user.id, id);
  if (!row) return NextResponse.json({ error: "ההקלטה לא נמצאה." }, { status: 404 });
  if (row.status !== "uploading") {
    return NextResponse.json({ attachment: toAttachmentView(row, await attachmentPlaybackUrl(row.storage_path)) });
  }

  const size = await attachmentSize(row.storage_path);
  if (size === null) {
    return NextResponse.json({ error: "הקובץ לא הגיע לשרת. נסה להעלות שוב." }, { status: 409 });
  }

  const wantsTranscription = transcribe && isMediaTranscriptionConfigured();
  const updated = await entityAudioRepo.update(user.id, id, {
    status: wantsTranscription ? "transcribing" : "stored",
    size_bytes: size || row.size_bytes,
    error: null,
  });
  if (wantsTranscription) {
    after(() => advanceAudioTranscription(id, { userId: user.id, budgetMs: 90_000 }).then(() => undefined));
  }

  return NextResponse.json({ attachment: toAttachmentView(updated, await attachmentPlaybackUrl(updated.storage_path)) });
}
