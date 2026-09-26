import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { learningResourcesRepo, learningTopicsRepo } from "@/lib/db/learning";
import { learningStepContentRepo } from "@/lib/db/learningStepContent";
import { getSupabaseClient } from "@/lib/supabase";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { sseResponse } from "@/lib/api/sse";
import { isProviderConfigured, streamStructuredData } from "@/lib/ai";
import { AiQuotaExceededError } from "@/lib/ai/service";
import { currentUserActor } from "@/lib/ai/actor";
import { STEP_BRIEF_SYSTEM, buildStepBriefPrompt } from "@/lib/learning/stepBriefPrompt";
import { normalizeStepBrief } from "@/lib/learning/stepBrief";
import { StepBriefContentSchema, StepBriefRequestSchema } from "@/lib/validations/learning";
import type { StepBriefContent } from "@/types/learning";
import type { Json } from "@/types/database";

export const runtime = "nodejs";
// Streaming keeps the connection alive, but the generation itself still has
// to finish inside the function's lifetime to be cached.
export const maxDuration = 60;

const RATE_LIMIT = { limit: 30, windowMs: 5 * 60 * 1000 };
const GENERATION_FAILED = "לא הצלחנו להכין את תקציר השלב כרגע. נסה שוב עוד רגע.";

/** The `done` event's payload. `partial` events carry a DeepPartial of `content`. */
export interface StepContentDoneEvent {
  content: StepBriefContent;
  cached: boolean;
}

/**
 * Every cached brief for a topic, in one round trip — the canvas prefetches
 * these when it opens, so moving along the timeline to any step that already
 * has a brief is a synchronous, zero-latency render. Never generates.
 */
export async function GET(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const topicId = request.nextUrl.searchParams.get("topicId");
  if (!topicId) return NextResponse.json({ error: "topicId is required" }, { status: 400 });
  // getCurrentUser(), not getUserByEmail + a manual 500 — see the POST
  // handler's own comment below for why.
  const user = await getCurrentUser();

  const { data, error } = await getSupabaseClient()
    .from("learning_step_content")
    .select("step_id, content")
    .eq("user_id", user.id)
    .eq("topic_id", topicId);
  if (error) return NextResponse.json({ error: "Could not read cached briefs" }, { status: 500 });

  const briefs: Record<string, StepBriefContent> = {};
  for (const row of data ?? []) {
    const valid = StepBriefContentSchema.safeParse(row.content);
    if (valid.success) briefs[row.step_id] = valid.data;
  }
  return NextResponse.json({ briefs } satisfies StepContentCacheResponse, { headers: { "Cache-Control": "private, no-store" } });
}

export interface StepContentCacheResponse {
  briefs: Record<string, StepBriefContent>;
}

/**
 * The topic canvas's Live Step Content Preview — Server-Sent Events.
 *
 * Cache first: a step that has a brief answers with a single `done` event,
 * no model call. Otherwise the brief streams in as `partial` snapshots and
 * finishes with `done` once validated and cached (lib/api/sse.ts explains why
 * the generation outlives a disconnect). Errors before the stream starts are
 * ordinary JSON responses; errors after are an `error` event.
 */
export async function POST(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = await parseJsonBody(request, StepBriefRequestSchema);
  if (parsed.error) return parsed.error;
  const { topicId, stepId } = parsed.data;

  // getCurrentUser(), not getUserByEmail + a manual 500: the former now
  // self-heals a missing row (lib/currentUser.ts, 2026-09-25) instead of
  // this route keeping its own, narrower copy of what used to be the same
  // failure everywhere.
  const user = await getCurrentUser();

  // Ownership of both, and that the step belongs to that topic, before the
  // cache or a model call — same rule as the masterclass route.
  const [topicRow, stepRow] = await Promise.all([learningTopicsRepo.get(user.id, topicId), learningResourcesRepo.get(user.id, stepId)]);
  if (!topicRow) return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  if (!stepRow || stepRow.topic_id !== topicId) return NextResponse.json({ error: "Step not found for this topic" }, { status: 404 });

  const cached = await learningStepContentRepo.findByStep(user.id, stepId);
  if (cached) {
    const valid = StepBriefContentSchema.safeParse(cached.content);
    if (valid.success) {
      return sseResponse(async (send) => send("done", { content: valid.data, cached: true } satisfies StepContentDoneEvent), GENERATION_FAILED);
    }
    // A row written under an older schema: regenerate rather than crash the canvas.
    await learningStepContentRepo.remove(user.id, cached.id).catch(() => undefined);
  }

  // Only a real generation counts against the burst limit — re-opening cached
  // steps while browsing the timeline must never be throttled.
  const limited = rateLimitResponse(`learning-step-content:${token.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;
  if (!isProviderConfigured()) return NextResponse.json({ error: "AI provider not configured" }, { status: 503 });

  const { data: siblings } = await getSupabaseClient()
    .from("learning_resources")
    .select("title")
    .eq("user_id", user.id)
    .eq("topic_id", topicId)
    .order("created_at", { ascending: true });

  const actor = await currentUserActor();
  const prompt = buildStepBriefPrompt({
    topicTitle: topicRow.title,
    stepTitle: stepRow.title,
    stepNotes: stepRow.notes,
    siblingTitles: (siblings ?? []).map((s) => s.title),
  });

  return sseResponse(async (send, sendPartial) => {
    let content: StepBriefContent;
    try {
      content = normalizeStepBrief(
        await streamStructuredData({ actor, schema: StepBriefContentSchema, system: STEP_BRIEF_SYSTEM, prompt, onPartial: sendPartial })
      );
    } catch (err) {
      if (err instanceof AiQuotaExceededError) {
        send("error", { error: err.message, code: "quota_exceeded", resetAt: err.resetAt.toISOString() });
        return;
      }
      console.error("[learning/step-content] generation failed:", err);
      send("error", { error: GENERATION_FAILED });
      return;
    }

    try {
      await learningStepContentRepo.insert({ user_id: user.id, topic_id: topicId, step_id: stepId, content: content as unknown as Json });
    } catch (insertErr) {
      // 23505: a concurrent request for the same step cached first. Both
      // results are valid briefs for this step; ours is still returned.
      if ((insertErr as { code?: string }).code !== "23505") console.error("[learning/step-content] cache insert failed:", insertErr);
    }
    send("done", { content, cached: false } satisfies StepContentDoneEvent);
  }, GENERATION_FAILED);
}
