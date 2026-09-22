import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getUserByEmail } from "@/lib/db/users";
import { learningResourcesRepo, learningTopicsRepo } from "@/lib/db/learning";
import { learningLessonContentsRepo } from "@/lib/db/learningLessonContents";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { aiQuotaResponse } from "@/lib/api/aiErrorResponse";
import { generateStructuredData, isProviderConfigured } from "@/lib/ai";
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

// Lower than a quick-log or chat rate: this is an expensive, cached
// generation a person triggers by opening a lesson, not something they'd
// legitimately fire many times a minute.
const RATE_LIMIT = { limit: 15, windowMs: 5 * 60 * 1000 };

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
    return NextResponse.json({ content: cached.content as unknown as LessonBlockContent, cached: true } satisfies LessonGenerateResponse);
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

  async function generateOnce(system: string) {
    const object = await generateStructuredData({
      actor,
      schema: LessonBlockContentSchema,
      system,
      prompt: prompt.user,
      operation: "course_module",
    });
    return LessonBlockContentSchema.safeParse(object);
  }

  try {
    let result = await generateOnce(prompt.system);

    // One automatic retry, folding the actual validation errors into the
    // prompt so the model can see exactly what it got wrong — a plain
    // re-ask tends to reproduce the same mistake. This is a second,
    // explicit layer on top of generateStructuredData's own internal
    // schema-guided generation/repair (lib/ai/service.ts) — cheap insurance
    // for a generation expensive and rich enough that failing outright
    // over one near-miss field would be a poor trade.
    if (!result.success) {
      const issues = result.error.issues.map((issue) => `- ${issue.path.join(".") || "(root)"}: ${issue.message}`).join("\n");
      const repairSystem = `${prompt.system}\n\nניסיון קודם החזיר JSON שלא עבר ולידציה. תקן את השגיאות הבאות והחזר JSON תקין לחלוטין התואם את הסכימה בדיוק, בלי טקסט נוסף מסביב:\n${issues}`;
      result = await generateOnce(repairSystem);
    }

    if (!result.success) {
      console.error("[learning/lesson/generate] validation failed after retry:", result.error.issues);
      return NextResponse.json({ error: GENERATION_FAILED }, { status: 502 });
    }

    const content = result.data;
    await learningLessonContentsRepo.insert({
      user_id: user.id,
      topic_id: topicId,
      step_id: stepId,
      user_age_group: userAgeGroup,
      teaching_mode: teachingMode,
      // Already validated by LessonBlockContentSchema.safeParse above —
      // see the read side's matching comment for why the cast is safe.
      content: content as unknown as Json,
    });

    return NextResponse.json({ content, cached: false } satisfies LessonGenerateResponse);
  } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
    console.error("[learning/lesson/generate] generation failed:", err);
    return NextResponse.json({ error: GENERATION_FAILED }, { status: 502 });
  }
}
