import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { generateStructuredData, isProviderConfigured } from "@/lib/ai";

// AI Auto-Prioritization for the Time & Tasks Space (Phase 5): given the
// user's currently-open tasks and a Personal DNA-shaped context object,
// asks the AI which tasks need immediate attention today. Returns IDs
// only — the frontend decides what to do with them (set is_high_priority),
// this route makes no writes itself.

export const runtime = "nodejs";
export const maxDuration = 60;

const RATE_LIMIT = { limit: 10, windowMs: 5 * 60 * 1000 }; // 10 prioritizations / 5 min

const MAX_TASKS = 50; // bounds the prompt, same spirit as the other AI routes' text-length caps

const taskInputSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  status: z.enum(["todo", "in-progress"]),
});

// `context` is intentionally a loose bag of unknown keys, not a strict
// Personal DNA schema — the frontend currently sends a placeholder object
// (real wiring to the personalDNA store slice is a follow-up milestone),
// and this route shouldn't need to change shape when that swap happens.
const requestSchema = z.object({
  tasks: z.array(taskInputSchema),
  context: z.record(z.string(), z.unknown()).optional().default({}),
});

const prioritizationSchema = z.object({
  prioritized_task_ids: z
    .array(z.string())
    .describe("Subset of the given task IDs that need immediate attention today — real urgency only, empty if none stand out"),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`prioritize-tasks:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A 'tasks' array is required." }, { status: 400 });
  }

  const { tasks, context } = parsed.data;

  // Nothing to evaluate — an honest empty result, not a wasted AI call.
  if (tasks.length === 0) {
    return NextResponse.json({ prioritized_task_ids: [] });
  }

  if (!isProviderConfigured()) {
    return NextResponse.json(
      { error: "תעדוף AI דורש מפתח OpenAI או Gemini מחובר. פנה למנהל המערכת." },
      { status: 503 }
    );
  }

  const boundedTasks = tasks.slice(0, MAX_TASKS);
  const validIds = new Set(boundedTasks.map((t) => t.id));

  try {
    const result = await generateStructuredData({
      schema: prioritizationSchema,
      system:
        "אתה עוזר אישי שמחליט אילו משימות מתוך רשימת המשימות הפתוחות של המשתמש דורשות תשומת לב מיידית היום. " +
        "התבסס על תאריכי היעד, הכותרת/התיאור של כל משימה, וההקשר האישי שסופק (שעות ריכוז, אירועים משמעותיים " +
        "קרובים וכו'). בחר רק משימות שבאמת דחופות עכשיו — לא כדי למלא מכסה. אם שום דבר לא בולט באמת, החזר " +
        "רשימה ריקה. אסור להמציא מזהה משימה שלא ניתן ברשימה שסופקה.",
      prompt: JSON.stringify({ tasks: boundedTasks, context }, null, 2),
    });

    // Defensive filter: never let a hallucinated ID reach the caller, even
    // though the system prompt already tells the model not to invent one.
    const prioritizedTaskIds = result.prioritized_task_ids.filter((id) => validIds.has(id));

    return NextResponse.json({ prioritized_task_ids: prioritizedTaskIds });
  } catch (err) {
    console.error("Task prioritization failed:", err);
    return NextResponse.json({ error: "התעדוף נכשל. נסה שוב." }, { status: 500 });
  }
}
