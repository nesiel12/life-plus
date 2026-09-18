import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/lib/api/sessionUser";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { entityAudioRepo } from "@/lib/db/entityAudio";
import { isAudioActive, toAttachmentView } from "@/lib/torah/attachments/audio";
import { advanceAudioTranscription } from "@/lib/torah/attachments/pipeline";
import { attachmentPlaybackUrl, removeAttachment } from "@/lib/torah/attachments/storage";

export const runtime = "nodejs";
export const maxDuration = 120;

/** One recording — used by the widget to poll a single row while it transcribes. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionUser();
  if (auth.response) return auth.response;
  const { user } = auth;
  const { id } = await context.params;

  const row = await entityAudioRepo.get(user.id, id);
  if (!row) return NextResponse.json({ error: "ההקלטה לא נמצאה." }, { status: 404 });

  const mediaUrl = row.status === "uploading" ? null : await attachmentPlaybackUrl(row.storage_path);
  if (isAudioActive(row.status)) {
    after(() => advanceAudioTranscription(id, { userId: user.id, budgetMs: 90_000 }).then(() => undefined));
  }
  return NextResponse.json({ attachment: toAttachmentView(row, mediaUrl) });
}

const patchSchema = z.object({ title: z.string().trim().min(1).max(200) });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionUser();
  if (auth.response) return auth.response;
  const { user } = auth;
  const { id } = await context.params;

  const parsed = await parseJsonBody(request, patchSchema);
  if (parsed.error) return parsed.error;

  const row = await entityAudioRepo.get(user.id, id);
  if (!row) return NextResponse.json({ error: "ההקלטה לא נמצאה." }, { status: 404 });

  const updated = await entityAudioRepo.update(user.id, id, { title: parsed.data.title });
  return NextResponse.json({ attachment: toAttachmentView(updated) });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionUser();
  if (auth.response) return auth.response;
  const { user } = auth;
  const { id } = await context.params;

  const row = await entityAudioRepo.get(user.id, id);
  if (!row) return NextResponse.json({ error: "ההקלטה לא נמצאה." }, { status: 404 });

  // Row first, then the object: an orphaned file costs storage, while a row
  // pointing at a deleted file costs a player that never loads.
  await entityAudioRepo.remove(user.id, id);
  if (row.storage_path) await removeAttachment(row.storage_path).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
