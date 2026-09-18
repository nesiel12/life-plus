import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api/sessionUser";
import { learningChunksRepo } from "@/lib/db/practice";
import { toChunkView } from "@/lib/torah/lessons/dto";

export const runtime = "nodejs";

/** Marks a learning chunk done — the "continue to the next part" gate. */
export async function POST(_request: Request, context: { params: Promise<{ id: string; chunkId: string }> }) {
  const auth = await requireSessionUser();
  if (auth.response) return auth.response;
  const { id: lessonId, chunkId } = await context.params;

  const chunk = await learningChunksRepo.get(auth.user.id, chunkId);
  if (!chunk || chunk.lesson_id !== lessonId) return NextResponse.json({ error: "החלק לא נמצא." }, { status: 404 });

  const completed = await learningChunksRepo.complete(auth.user.id, chunkId);
  return NextResponse.json({ chunk: toChunkView(completed), firstCompletion: !chunk.completed_at });
}
