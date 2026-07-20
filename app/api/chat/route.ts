import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getUserByEmail } from "@/lib/db/users";
import { personalDnaRepo } from "@/lib/db/personalDna";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { buildSystemPrompt } from "@/lib/chatSystemPrompt";

export const runtime = "nodejs";

const RATE_LIMIT = { limit: 20, windowMs: 5 * 60 * 1000 }; // 20 messages / 5 min

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

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ reply: mockReply(message) });
  }

  try {
    const user = await getUserByEmail(session.user.email);
    const dna = user ? await personalDnaRepo.get(user.id) : null;

    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      system: buildSystemPrompt(dna),
      messages: [...history, { role: "user", content: message }],
    });

    return NextResponse.json({ reply: text });
  } catch {
    return NextResponse.json({ reply: mockReply(message) });
  }
}
