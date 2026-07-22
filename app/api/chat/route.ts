import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getUserByEmail } from "@/lib/db/users";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { buildSystemPrompt } from "@/lib/chatSystemPrompt";
import { buildAtlasContext } from "@/lib/context/buildAtlasContext";
import { streamChatReply, isProviderConfigured } from "@/lib/ai";

export const runtime = "nodejs";

const RATE_LIMIT = { limit: 20, windowMs: 5 * 60 * 1000 }; // 20 messages / 5 min
const MAX_BASED_ON = 3;

const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      })
    )
    .max(50)
    .optional(),
});

function mockReply(message: string): string {
  return `אני איתך. שמעתי אותך אומר: "${message}". עדיין אין מפתח API מחובר, אז זו תגובה לדוגמה בלבד — אבל ברגע שתחבר את המפתח, אני אתחיל להשתקף אליך באמת מתוך הדפוסים שלך.`;
}

// AI Companion Experience v2 (docs/ATLAS_ARCHITECTURE_VISION.md §10): a
// plain text/plain streamed body plus one small header, on every path
// (real reply, mock fallback, and error fallback alike) — so the client
// has exactly one response shape to consume regardless of which path
// produced it, instead of branching on JSON-vs-stream.
function textResponse(text: string, basedOn: string[]): Response {
  return new Response(text, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-atlas-based-on": JSON.stringify(basedOn),
    },
  });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`chat:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const parsed = await parseJsonBody(request, chatRequestSchema);
  if (parsed.error) return parsed.error;
  const { message, history = [] } = parsed.data;

  if (!isProviderConfigured()) {
    return textResponse(mockReply(message), []);
  }

  try {
    const user = await getUserByEmail(session.user.email);
    const context = user ? await buildAtlasContext(user.id, { query: message }) : undefined;
    const { prompt, topSignals } = buildSystemPrompt(context);
    const basedOn = topSignals.slice(0, MAX_BASED_ON).map((signal) => signal.summary);

    const result = streamChatReply({
      system: prompt,
      messages: [...history, { role: "user", content: message }],
    });

    return result.toTextStreamResponse({
      headers: { "x-atlas-based-on": JSON.stringify(basedOn) },
    });
  } catch {
    return textResponse(mockReply(message), []);
  }
}
