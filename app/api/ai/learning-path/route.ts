import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { isProviderConfigured } from "@/lib/ai";
import { generateLearningPath } from "@/lib/ai/learningPath";

// AI Track Builder engine for the Learning & Knowledge Space (Phase 7) —
// takes a bare topic title and returns a structured starter curriculum
// (YouTube/podcast suggestions, a conceptual summary, a 3-question quiz,
// required equipment). Standalone endpoint, same shape as the other
// app/api/ai/* routes; app/actions/learning.ts's generateLearningPathAction
// calls the shared lib/ai/learningPath module directly (it already has an
// authenticated Server Action context and needs to persist the result), not
// this route over HTTP.

export const runtime = "nodejs";
export const maxDuration = 60;

const RATE_LIMIT = { limit: 10, windowMs: 5 * 60 * 1000 }; // 10 track builds / 5 min

const requestSchema = z.object({
  topic: z.string().min(1, "topic is required"),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`learning-path:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A non-empty 'topic' string is required." }, { status: 400 });
  }

  if (!isProviderConfigured()) {
    return NextResponse.json(
      { error: "בניית מסלול למידה דורשת מפתח OpenAI או Gemini מחובר. פנה למנהל המערכת." },
      { status: 503 }
    );
  }

  try {
    const path = await generateLearningPath(parsed.data.topic);
    return NextResponse.json(path);
  } catch (err) {
    console.error("Learning path generation failed:", err);
    return NextResponse.json({ error: "בניית מסלול הלימוד נכשלה. נסה שוב." }, { status: 500 });
  }
}
