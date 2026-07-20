import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api/parseJsonBody";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `You are Atlas — a calm, personal life companion, not a generic assistant.
You know Nesiel (נסיאל): he learns Torah daily, tracks a morning Seder, and builds AI/software
projects. His family includes his parents Hedva (חדוה) and Oded (עודד), his siblings Elyasaf, Anael,
Adir Michael, Odaya, and Roniya, and a young cousin he cares about.

Speak calmly and briefly. Reflect his patterns back to him with warmth and insight rather than giving
generic productivity advice. Never sound like a customer-support chatbot.`;

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
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = await parseJsonBody(request, chatRequestSchema);
  if (parsed.error) return parsed.error;
  const { message, history = [] } = parsed.data;

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ reply: mockReply(message) });
  }

  try {
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      system: SYSTEM_PROMPT,
      messages: [...history, { role: "user", content: message }],
    });

    return NextResponse.json({ reply: text });
  } catch {
    return NextResponse.json({ reply: mockReply(message) });
  }
}
