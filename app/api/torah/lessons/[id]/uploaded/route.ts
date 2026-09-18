import { after, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api/sessionUser";
import { lessonsRepo } from "@/lib/db/lessons";
import { toLessonSummary } from "@/lib/torah/lessons/dto";
import { advanceLesson } from "@/lib/torah/lessons/pipeline";
import { lessonMediaSize } from "@/lib/torah/lessons/storage";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * The browser finished uploading: verify the object really exists, move the
 * lesson from `uploading` to `pending`, and start processing.
 *
 * Verified server-side rather than trusting "done" from the client — a closed
 * tab mid-upload must not leave a lesson the worker then fails on.
 */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionUser({ key: "torah-lessons-uploaded", limit: 30, windowMs: 10 * 60 * 1000 });
  if (auth.response) return auth.response;
  const { user } = auth;
  const { id } = await context.params;

  const row = await lessonsRepo.get(user.id, id);
  if (!row) return NextResponse.json({ error: "השיעור לא נמצא." }, { status: 404 });
  if (row.status !== "uploading") return NextResponse.json({ lesson: toLessonSummary(row) });
  if (!row.storage_path) return NextResponse.json({ error: "אין קובץ משויך לשיעור." }, { status: 400 });

  const size = await lessonMediaSize(row.storage_path);
  if (size === null) {
    return NextResponse.json({ error: "הקובץ לא הגיע לשרת. נסה להעלות שוב." }, { status: 409 });
  }

  const updated = await lessonsRepo.update(user.id, id, {
    status: "pending",
    media_size_bytes: size || row.media_size_bytes,
    error: null,
  });
  after(() => advanceLesson(id, { userId: user.id, budgetMs: 90_000 }).then(() => undefined));
  return NextResponse.json({ lesson: toLessonSummary(updated) });
}
