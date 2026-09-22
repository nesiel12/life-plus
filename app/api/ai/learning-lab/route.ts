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
  LEARNING_LAB_SYSTEM,
  chapterBreakdownSchema,
  feynmanEvaluationSchema,
  flashcardDeckSchema,
  formatResourceContext,
  quizSchema,
  topicSuggestionsSchema,
} from "@/lib/ai/agents/learningLabAgent";
import { buildFeynmanPrompt } from "@/lib/learning/feynman";

// The Learning lab's AI endpoint: quiz generation, flashcard generation,
// chapter breakdown, Feynman grading, and new-topic suggestions. One route,
// same reasoning as /api/ai/study-agent — see lib/ai/agents/learningLabAgent.ts.

export const runtime = "nodejs";
export const maxDuration = 60;

const RATE_LIMIT = { limit: 30, windowMs: 5 * 60 * 1000 };

const resourceContextSchema = z.object({ title: z.string().min(1).max(300), notes: z.string().max(1000).optional() });

const requestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("quiz"),
    topicTitle: z.string().trim().min(1).max(200),
    resources: z.array(resourceContextSchema).max(60).default([]),
  }),
  z.object({
    mode: z.literal("flashcards"),
    topicTitle: z.string().trim().min(1).max(200),
    resources: z.array(resourceContextSchema).max(60).default([]),
  }),
  z.object({
    mode: z.literal("chapterBreakdown"),
    bookTitle: z.string().trim().min(1).max(300),
    chapterText: z.string().trim().min(1).max(20_000),
  }),
  z.object({
    mode: z.literal("feynmanGrade"),
    topicTitle: z.string().trim().min(1).max(200),
    concept: z.string().trim().min(1).max(300),
    explanation: z.string().trim().min(1).max(4000),
  }),
  z.object({
    mode: z.literal("suggestTopics"),
    existingTopics: z.array(z.object({ title: z.string(), category: z.string().optional() })).max(60),
    activeGoals: z.array(z.string()).max(20).default([]),
  }),
]);

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`learning-lab:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const actor = await currentUserActor();

  const parsed = await parseJsonBody(request, requestSchema);
  if (parsed.error) return parsed.error;

  if (!isProviderConfigured()) {
    return NextResponse.json({ error: "מעבדת הלמידה דורשת מפתח OpenAI או Gemini מחובר. פנה למנהל המערכת." }, { status: 503 });
  }

  const body = parsed.data;

  try {
    if (body.mode === "quiz") {
      const context = formatResourceContext(body.resources);
      const quiz = await generateStructuredData({
        actor,
        schema: quizSchema,
        system: LEARNING_LAB_SYSTEM.quiz,
        prompt: [`נושא: ${body.topicTitle}`, context ? `משאבים:\n${context}` : "אין עדיין משאבים — בנה שאלות כלליות על הנושא."].join("\n\n"),
      });
      return NextResponse.json({ mode: "quiz" as const, quiz });
    }

    if (body.mode === "flashcards") {
      const context = formatResourceContext(body.resources);
      const deck = await generateStructuredData({
        actor,
        schema: flashcardDeckSchema,
        system: LEARNING_LAB_SYSTEM.flashcards,
        prompt: [`נושא: ${body.topicTitle}`, context ? `משאבים:\n${context}` : "אין עדיין משאבים — בנה כרטיסיות כלליות על הנושא."].join("\n\n"),
      });
      return NextResponse.json({ mode: "flashcards" as const, deck });
    }

    if (body.mode === "chapterBreakdown") {
      const breakdown = await generateStructuredData({
        actor,
        schema: chapterBreakdownSchema,
        system: LEARNING_LAB_SYSTEM.chapterBreakdown,
        prompt: `הספר: ${body.bookTitle}\n\nטקסט הפרק:\n${body.chapterText}`,
      });
      return NextResponse.json({ mode: "chapterBreakdown" as const, breakdown });
    }

    if (body.mode === "feynmanGrade") {
      const evaluation = await generateStructuredData({
        actor,
        schema: feynmanEvaluationSchema,
        system: LEARNING_LAB_SYSTEM.feynmanGrade,
        prompt: buildFeynmanPrompt(body),
      });
      return NextResponse.json({ mode: "feynmanGrade" as const, evaluation });
    }

    const existing = body.existingTopics.map((t) => `- ${t.title}${t.category ? ` (${t.category})` : ""}`).join("\n") || "אין עדיין נושאים.";
    const goals = body.activeGoals.length ? body.activeGoals.map((g) => `- ${g}`).join("\n") : "אין יעדים פעילים כרגע.";
    const suggestions = await generateStructuredData({
      actor,
      schema: topicSuggestionsSchema,
      system: LEARNING_LAB_SYSTEM.suggestTopics,
      prompt: `נושאי הלימוד הקיימים של המשתמש:\n${existing}\n\nהיעדים הפעילים שלו:\n${goals}`,
    });
    return NextResponse.json({ mode: "suggestTopics" as const, suggestions });
  } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
    return NextResponse.json({ error: "מעבדת הלמידה לא זמינה כרגע. נסה שוב." }, { status: 502 });
  }
}
