import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { isProviderConfigured } from "@/lib/ai";
import { resolveTaskAssist } from "@/lib/ai/agents/taskAgent";

// TaskAgent endpoint (Sprint 5): "help me with this task" for one task, one
// call. See lib/ai/agents/taskAgent.ts for the mode split and the honesty
// constraint around not having live web access.

export const runtime = "nodejs";
export const maxDuration = 30;

const RATE_LIMIT = { limit: 20, windowMs: 5 * 60 * 1000 };

const requestSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(2000).optional(),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`task-agent:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const parsed = await parseJsonBody(request, requestSchema);
  if (parsed.error) return parsed.error;

  if (!isProviderConfigured()) {
    return NextResponse.json(
      { error: "עוזר הביצוע דורש מפתח OpenAI או Gemini מחובר. פנה למנהל המערכת." },
      { status: 503 }
    );
  }

  try {
    const assist = await resolveTaskAssist(parsed.data);
    return NextResponse.json({ assist });
  } catch {
    return NextResponse.json({ error: "עוזר הביצוע לא זמין כרגע. נסה שוב." }, { status: 502 });
  }
}
