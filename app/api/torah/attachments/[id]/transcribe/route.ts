import { after, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api/sessionUser";
import { isMediaTranscriptionConfigured } from "@/lib/ai";
import { entityAudioRepo } from "@/lib/db/entityAudio";
import { canTranscribe, toAttachmentView } from "@/lib/torah/attachments/audio";
import { advanceAudioTranscription } from "@/lib/torah/attachments/pipeline";
import { attachmentPlaybackUrl } from "@/lib/torah/attachments/storage";
import type { Json } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * "תמלל הקלטה זו" — the on-demand half of the feature.
 *
 * Attaching a recording costs nothing; this is the only thing that spends AI
 * quota, and it is always the learner's own decision. The work itself runs in
 * the background (lib/torah/attachments/pipeline.ts): this route only moves the
 * row into `transcribing` and kicks the first step off after responding, so the
 * request returns immediately however long the recording is.
 *
 * A retry after a failure starts from a clean cursor rather than resuming a
 * broken plan — the previous attempt's error is what the learner is retrying.
 */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionUser({ key: "torah-attachments-transcribe", limit: 20, windowMs: 10 * 60 * 1000 });
  if (auth.response) return auth.response;
  const { user } = auth;
  const { id } = await context.params;

  const row = await entityAudioRepo.get(user.id, id);
  if (!row) return NextResponse.json({ error: "ההקלטה לא נמצאה." }, { status: 404 });

  if (!isMediaTranscriptionConfigured()) {
    return NextResponse.json({ error: "אין מפתח Gemini מחובר, ולכן אי אפשר לתמלל כרגע." }, { status: 503 });
  }
  if (row.status === "uploading") {
    return NextResponse.json({ error: "ההעלאה עוד לא הושלמה." }, { status: 409 });
  }
  if (!canTranscribe(row.status)) {
    return NextResponse.json({ attachment: toAttachmentView(row, await attachmentPlaybackUrl(row.storage_path)) });
  }

  const updated = await entityAudioRepo.update(user.id, id, {
    status: "transcribing",
    error: null,
    attempts: 0,
    progress: {} as Json,
    transcript: null,
    transcript_lines: [] as unknown as Json,
  });
  after(() => advanceAudioTranscription(id, { userId: user.id, budgetMs: 90_000 }).then(() => undefined));

  return NextResponse.json({ attachment: toAttachmentView(updated, await attachmentPlaybackUrl(updated.storage_path)) });
}
