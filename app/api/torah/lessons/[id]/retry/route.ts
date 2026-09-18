import { after, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api/sessionUser";
import { getSupabaseClient } from "@/lib/supabase";
import { lessonsRepo } from "@/lib/db/lessons";
import { toLessonSummary } from "@/lib/torah/lessons/dto";
import { advanceLesson, readProgress } from "@/lib/torah/lessons/pipeline";
import type { Json } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Retries a failed lesson from where it stopped, not from scratch: a lesson
 * that failed in analysis keeps its transcript, and one that failed on window
 * 9 of 12 resumes at window 9. Only a failure before transcription began
 * restarts at the beginning.
 */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionUser({ key: "torah-lessons-retry", limit: 10, windowMs: 10 * 60 * 1000 });
  if (auth.response) return auth.response;
  const { user } = auth;
  const { id } = await context.params;

  const row = await lessonsRepo.get(user.id, id);
  if (!row) return NextResponse.json({ error: "השיעור לא נמצא." }, { status: 404 });
  if (row.status !== "failed") return NextResponse.json({ lesson: toLessonSummary(row) });

  const progress = readProgress(row);
  const resumeAt =
    progress.phase === "analyze" || progress.phase === "write"
      ? "analyzing"
      : progress.phase === "transcribe" && (progress.windows?.length ?? 0) > 0
        ? "transcribing"
        : "pending";

  if (resumeAt === "pending") {
    // A fresh start must not append to a half-written transcript.
    await getSupabaseClient().from("lesson_transcripts").delete().eq("user_id", user.id).eq("lesson_id", id);
  }

  const updated = await lessonsRepo.update(user.id, id, {
    status: resumeAt,
    error: null,
    attempts: 0,
    lease_until: null,
    progress: (resumeAt === "pending" ? {} : { ...progress, lastError: undefined, pausedUntil: undefined }) as Json,
  });
  after(() => advanceLesson(id, { userId: user.id, budgetMs: 90_000 }).then(() => undefined));
  return NextResponse.json({ lesson: toLessonSummary(updated) });
}
