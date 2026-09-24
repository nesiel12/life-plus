import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getUserByEmail } from "@/lib/db/users";
import { learningResourcesRepo, learningTopicsRepo } from "@/lib/db/learning";
import { learningLessonContentsRepo } from "@/lib/db/learningLessonContents";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { generateStructuredData, isProviderConfigured, streamStructuredData } from "@/lib/ai";
import { AiQuotaExceededError } from "@/lib/ai/service";
import { sseResponse } from "@/lib/api/sse";
import { currentUserActor } from "@/lib/ai/actor";
import { buildLessonPrompt } from "@/lib/learning/agePromptEngine";
import { LessonBlockContentSchema, LessonGenerateRequestSchema } from "@/lib/validations/learning";
import type { LessonBlockContent } from "@/types/learning";
import type { Json } from "@/types/database";

export const runtime = "nodejs";
// A full masterclass block (origin story, several pioneer profiles, deep
// core content, trivia, checkpoints) is a much heavier generation than a
// quick chat reply or a single quiz — given more room than the platform's
// default before this route's own honest error kicks in.
export const maxDuration = 60;
// Streaming answers the timeouts this route used to hit: bytes flow from the
// first second (heartbeats, then partial snapshots), so nothing idles out,
// and the client shows the lesson being written. The generation itself must
// still fit in maxDuration — the repair retry only runs if enough is left.
const ROUTE_BUDGET_MS = 55_000;
const MIN_RETRY_BUDGET_MS = 15_000;

// Lower than a quick-log or chat rate: this is an expensive, cached
// generation a person triggers by opening a lesson, not something they'd
// legitimately fire many times a minute.
const RATE_LIMIT = { limit: 15, windowMs: 5 * 60 * 1000 };

/**
 * The `done` event's payload (the route answers in Server-Sent Events:
 * `partial` snapshots while generating, then `done` or `error`).
 */
export interface LessonGenerateResponse {
  content: LessonBlockContent;
  /** Whether this came from learning_lesson_contents rather than a fresh model call. */
  cached: boolean;
}

const GENERATION_FAILED = "לא הצלחנו ליצור שיעור כרגע. נסה שוב עוד רגע.";

export async function POST(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = await parseJsonBody(request, LessonGenerateRequestSchema);
  if (parsed.error) return parsed.error;
  const { topicId, stepId, userAgeGroup, teachingMode, customEmphasis } = parsed.data;

  const limited = rateLimitResponse(`learning-lesson-generate:${token.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const user = await getUserByEmail(token.email);
  if (!user) {
    return NextResponse.json({ error: "User record not found for authenticated session" }, { status: 500 });
  }

  // Ownership check before touching the cache or spending a model call —
  // never generate or cache content keyed to a topic/step this user doesn't
  // actually own. stepId is validated as belonging to topicId specifically,
  // not just to the user, so one topic's cache can't be seeded by pointing
  // it at another topic's step id.
  const [topicRow, stepRow] = await Promise.all([learningTopicsRepo.get(user.id, topicId), learningResourcesRepo.get(user.id, stepId)]);
  if (!topicRow) return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  if (!stepRow || stepRow.topic_id !== topicId) return NextResponse.json({ error: "Step not found for this topic" }, { status: 404 });

  const cached = await learningLessonContentsRepo.findCached(user.id, topicId, stepId, userAgeGroup, teachingMode);
  if (cached) {
    // The Json column's type is a structural union with no direct overlap
    // with LessonBlockContent's own shape — safe here because the only
    // writer (below) always stores a value that already passed
    // LessonBlockContentSchema before insert.
    const hit = { content: cached.content as unknown as LessonBlockContent, cached: true } satisfies LessonGenerateResponse;
    return sseResponse(async (send) => send("done", hit), GENERATION_FAILED);
  }

  if (!isProviderConfigured()) {
    return NextResponse.json({ error: "AI provider not configured" }, { status: 503 });
  }

  const actor = await currentUserActor();
  const prompt = buildLessonPrompt({
    topicTitle: topicRow.title,
    stepTitle: stepRow.title,
    userAgeGroup,
    teachingMode,
    customEmphasis,
  });

  const startedAt = Date.now();

  return sseResponse(async (send, sendPartial) => {
    let content: LessonBlockContent;
    try {
      content = await streamStructuredData({
        actor,
        schema: LessonBlockContentSchema,
        system: prompt.system,
        prompt: prompt.user,
        operation: "course_module",
        onPartial: sendPartial,
      });
    } catch (err) {
      if (err instanceof AiQuotaExceededError) {
        send("error", { error: err.message, code: "quota_exceeded", resetAt: err.resetAt.toISOString() });
        return;
      }
      // One repair attempt, if the budget allows: a streamed object that
      // missed the schema on one field is usually fixed by a second, plain
      // structured call told exactly that — the same one retry (and the same
      // second quota charge) this route has always made.
      const remaining = ROUTE_BUDGET_MS - (Date.now() - startedAt);
      if (remaining < MIN_RETRY_BUDGET_MS) {
        console.error("[learning/lesson/generate] stream failed, no budget to retry:", err);
        send("error", { error: GENERATION_FAILED });
        return;
      }
      console.warn("[learning/lesson/generate] stream failed, retrying once:", err instanceof Error ? err.message : err);
      const repairSystem = `${prompt.system}\n\nניסיון קודם החזיר JSON שלא עבר ולידציה. החזר JSON תקין לחלוטין התואם את הסכימה בדיוק, בלי טקסט נוסף מסביב.`;
      const retried = LessonBlockContentSchema.safeParse(
        await generateStructuredData({
          actor,
          schema: LessonBlockContentSchema,
          system: repairSystem,
          prompt: prompt.user,
          operation: "course_module",
          timeoutMs: remaining - 5_000,
        })
      );
      if (!retried.success) {
        console.error("[learning/lesson/generate] validation failed after retry:", retried.error.issues);
        send("error", { error: GENERATION_FAILED });
        return;
      }
      content = retried.data;
    }

    try {
      await learningLessonContentsRepo.insert({
        user_id: user.id,
        topic_id: topicId,
        step_id: stepId,
        user_age_group: userAgeGroup,
        teaching_mode: teachingMode,
        // Validated against LessonBlockContentSchema by the generation above.
        content: content as unknown as Json,
      });
    } catch (insertErr) {
      // 23505 = unique_violation on the cache key: two requests for the same
      // never-before-generated combination both missed the cache (a
      // double-click, say). Return the winner's row — same key, equally valid.
      if ((insertErr as { code?: string }).code !== "23505") throw insertErr;
      const winner = await learningLessonContentsRepo.findCached(user.id, topicId, stepId, userAgeGroup, teachingMode);
      if (!winner) throw insertErr;
      send("done", { content: winner.content as unknown as LessonBlockContent, cached: true } satisfies LessonGenerateResponse);
      return;
    }

    send("done", { content, cached: false } satisfies LessonGenerateResponse);
  }, GENERATION_FAILED);
}
