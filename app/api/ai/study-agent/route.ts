import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { generateStructuredData, isProviderConfigured } from "@/lib/ai";
import { currentUserActor } from "@/lib/ai/actor";
import { aiQuotaResponse } from "@/lib/api/aiErrorResponse";
import {
  STUDY_AGENT_SYSTEM,
  studyGradeSchema,
  studyQuizSchema,
  studySummarySchema,
  truncateTranscript,
} from "@/lib/ai/agents/studyAgent";

// StudyAgent endpoint: summarize a video, quiz on it, or grade an answer.
// One route rather than three because all three modes are grounded in the same
// transcript and share a persona — see lib/ai/agents/studyAgent.ts.

export const runtime = "nodejs";
export const maxDuration = 60;

const RATE_LIMIT = { limit: 30, windowMs: 5 * 60 * 1000 };

const requestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("summary"),
    transcript: z.string().trim().min(1),
  }),
  z.object({
    mode: z.literal("quiz"),
    transcript: z.string().trim().min(1),
    mastery: z.number().int().min(0).max(100).default(0),
    askedQuestions: z.array(z.string()).max(20).default([]),
  }),
  z.object({
    mode: z.literal("discuss"),
    transcript: z.string().trim().min(1),
    question: z.string().trim().min(1).max(1000),
    answer: z.string().trim().min(1).max(2000),
  }),
]);

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(
    `study-agent:${session.user.email}`,
    RATE_LIMIT.limit,
    RATE_LIMIT.windowMs
  );
  if (limited) return limited;

  // Resolved from the session, never from the request body.
  const actor = await currentUserActor();

  const parsed = await parseJsonBody(request, requestSchema);
  if (parsed.error) return parsed.error;

  if (!isProviderConfigured()) {
    return NextResponse.json(
      { error: "עוזר הלימוד דורש מפתח OpenAI או Gemini מחובר. פנה למנהל המערכת." },
      { status: 503 }
    );
  }

  const body = parsed.data;
  const transcript = truncateTranscript(body.transcript);

  try {
    if (body.mode === "summary") {
      const summary = await generateStructuredData({
      actor,
        schema: studySummarySchema,
        system: STUDY_AGENT_SYSTEM.summary,
        prompt: `תמלול הסרטון:\n${transcript}`,
      });
      return NextResponse.json({ mode: "summary" as const, summary });
    }

    if (body.mode === "quiz") {
      const asked = body.askedQuestions.length
        ? `\n\nשאלות שכבר נשאלו (אל תחזור עליהן):\n${body.askedQuestions.map((q) => `- ${q}`).join("\n")}`
        : "";
      const quiz = await generateStructuredData({
      actor,
        schema: studyQuizSchema,
        system: STUDY_AGENT_SYSTEM.quiz,
        prompt: `רמת השליטה הנוכחית של המשתמש: ${body.mastery}/100.\n\nתמלול הסרטון:\n${transcript}${asked}`,
      });
      return NextResponse.json({ mode: "quiz" as const, quiz });
    }

    const grade = await generateStructuredData({
      actor,
      schema: studyGradeSchema,
      system: STUDY_AGENT_SYSTEM.discuss,
      prompt: [
        `השאלה שנשאלה: ${body.question}`,
        `תשובת המשתמש: ${body.answer}`,
        "",
        `תמלול הסרטון:\n${transcript}`,
      ].join("\n"),
    });
    return NextResponse.json({ mode: "discuss" as const, grade });
  } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
    return NextResponse.json({ error: "עוזר הלימוד לא זמין כרגע. נסה שוב." }, { status: 502 });
  }
}
