import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/lib/api/sessionUser";
import { aiQuotaResponse } from "@/lib/api/aiErrorResponse";
import { generateStructuredData, isProviderConfigured } from "@/lib/ai";
import { currentUserActor } from "@/lib/ai/actor";
import { havrutaMessagesRepo, havrutaThreadsRepo } from "@/lib/db/havruta";
import { insightsPrompt, insightsSystemPrompt, normalizeInsights } from "@/lib/torah/havruta";
import { toThreadView } from "@/lib/torah/havrutaDto";
import type { Json } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 60;

const insightsSchema = z.object({
  insights: z
    .array(
      z.object({
        text: z.string().describe("התובנה, משפט או שניים בעברית"),
        kind: z.enum(["chiddush", "kushya", "resolution"]).describe("chiddush=חידוש, kushya=קושיא שנשארה פתוחה, resolution=יישוב שהתקבל"),
      })
    )
    .describe("עד 4 תובנות שעלו בדיון בפועל"),
});

/**
 * POST — distils a discussion into a few insights ("מה יצא לנו מהדיון").
 * Stored on the thread; the Shabbat sheet prints them.
 */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionUser({ key: "torah-havruta-insights", limit: 10, windowMs: 5 * 60 * 1000 });
  if (auth.response) return auth.response;
  const { user } = auth;
  const { id } = await context.params;

  const thread = await havrutaThreadsRepo.get(user.id, id);
  if (!thread) return NextResponse.json({ error: "הדיון לא נמצא." }, { status: 404 });

  const messages = await havrutaMessagesRepo.listForThread(user.id, id);
  if (messages.filter((m) => m.role === "assistant").length === 0) {
    return NextResponse.json({ error: "עוד אין דיון לסכם." }, { status: 400 });
  }
  if (!isProviderConfigured()) {
    return NextResponse.json({ error: "אין מפתח AI מחובר, אז אי אפשר לסכם כרגע." });
  }

  try {
    const object = await generateStructuredData({
      actor: await currentUserActor(),
      schema: insightsSchema,
      system: insightsSystemPrompt(),
      prompt: insightsPrompt(thread.title ?? "דיון", messages.map((m) => ({ role: m.role, content: m.content }))),
    });
    const insights = normalizeInsights(object.insights);
    const updated = await havrutaThreadsRepo.update(user.id, id, {
      insights: insights as unknown as Json,
      insights_at: new Date().toISOString(),
    });
    return NextResponse.json({ thread: toThreadView(updated) });
  } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
    console.error("havruta insights failed:", err);
    return NextResponse.json({ error: "הסיכום נכשל. נסה שוב." });
  }
}
