import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api/sessionUser";
import { handwritingScansRepo } from "@/lib/db/handwritingScans";
import { removeScanImages } from "@/lib/torah/attachments/storage";

export const runtime = "nodejs";

/** Discards a scan the learner did not keep, and the page images with it. */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionUser();
  if (auth.response) return auth.response;
  const { user } = auth;
  const { id } = await context.params;

  const scan = await handwritingScansRepo.get(user.id, id);
  if (!scan) return NextResponse.json({ error: "הסריקה לא נמצאה." }, { status: 404 });

  const paths = Array.isArray(scan.storage_paths) ? (scan.storage_paths as string[]) : [];
  await handwritingScansRepo.remove(user.id, id);
  await removeScanImages(paths).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
