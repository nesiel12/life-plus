import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { isProviderConfigured } from "@/lib/ai";
import { generateCourseModule } from "@/lib/ai/courseModule";
import { currentUserActor } from "@/lib/ai/actor";
import { aiQuotaResponse } from "@/lib/api/aiErrorResponse";

// Deep course material for the Learning Hub's split view. Distinct from
// app/api/ai/learning-path, which builds the *starter curriculum* (what to
// watch, what to read); this generates the actual multi-section teaching
// text plus its chapter quiz.

export const runtime = "nodejs";
// Above lib/ai/service.ts's internal timeouts. This one generates several
// long sections, so it is the slowest AI call in the app by some margin.
export const maxDuration = 60;

const RATE_LIMIT = { limit: 10, windowMs: 5 * 60 * 1000 };

const requestSchema = z.object({
  topic: z.string().trim().min(1).max(200),
  focus: z.string().trim().max(200).optional(),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`course-module:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  // Resolved from the session, never from the request body.
  const actor = await currentUserActor();

  const parsed = await parseJsonBody(request, requestSchema);
  if (parsed.error) return parsed.error;

  if (!isProviderConfigured()) {
    return NextResponse.json(
      { error: "בניית חומר הלימוד דורשת מפתח OpenAI או Gemini מחובר. פנה למנהל המערכת." },
      { status: 503 }
    );
  }

  try {
    const courseModule = await generateCourseModule(parsed.data.topic, actor, parsed.data.focus);
    return NextResponse.json({ module: courseModule });
  } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
    // The model failover chain (lib/ai/service.ts) has already been
    // exhausted by the time this is reached.
    console.error("[course-module] generation failed:", err);
    return NextResponse.json({ error: "לא הצלחנו לבנות את חומר הלימוד כרגע. נסה שוב." }, { status: 502 });
  }
}
