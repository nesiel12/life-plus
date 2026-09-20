import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/lib/api/sessionUser";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { aiQuotaResponse } from "@/lib/api/aiErrorResponse";
import { generateStructuredData, isProviderConfigured } from "@/lib/ai";
import { learningTopicsRepo } from "@/lib/db/learning";
import { learningRoadmapsRepo } from "@/lib/db/learningInteractive";
import { normalizeRoadmap, type RoadmapNode } from "@/lib/learning/roadmap";
import type { Json } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 60;

const roadmapSchema = z.object({
  nodes: z
    .array(
      z.object({
        id: z.string().describe("מזהה קצר באנגלית באותיות קטנות, למשל basics"),
        title: z.string().describe("שם השלב בעברית, 2-5 מילים"),
        summary: z.string().describe("משפט אחד בעברית: מה לומדים בשלב הזה ולמה הוא חשוב"),
        dependsOn: z.array(z.string()).describe("מזהי השלבים שחייבים לפניו. ריק לשלב פתיחה"),
      })
    )
    .describe("6-10 שלבים שבונים את הנושא מהיסוד ועד שליטה, עם תלויות אמיתיות"),
});

function toView(row: { topic_id: string; nodes: Json; completed: Json }) {
  return {
    topicId: row.topic_id,
    nodes: (Array.isArray(row.nodes) ? row.nodes : []) as unknown as RoadmapNode[],
    completed: (Array.isArray(row.completed) ? row.completed : []).filter((v): v is string => typeof v === "string"),
  };
}

/** GET ?topicId= — the topic's roadmap, or null before one is built. */
export async function GET(request: Request) {
  const auth = await requireSessionUser();
  if (auth.response) return auth.response;
  const topicId = new URL(request.url).searchParams.get("topicId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(topicId)) return NextResponse.json({ error: "נושא לא תקין." }, { status: 400 });
  const row = await learningRoadmapsRepo.findByTopic(auth.user.id, topicId);
  return NextResponse.json({ roadmap: row ? toView(row) : null });
}

const buildSchema = z.object({ topicId: z.string().uuid(), regenerate: z.boolean().optional() });

/**
 * Builds a topic's roadmap: steps from foundations to mastery, with the
 * prerequisites between them. The model proposes; lib/learning/roadmap.ts
 * makes the graph sound (no unknown ids, no cycles) before it is stored.
 */
export async function POST(request: Request) {
  const auth = await requireSessionUser({ key: "learning-roadmap", limit: 10, windowMs: 10 * 60 * 1000 });
  if (auth.response) return auth.response;
  const { user } = auth;
  const parsed = await parseJsonBody(request, buildSchema);
  if (parsed.error) return parsed.error;

  const topic = await learningTopicsRepo.get(user.id, parsed.data.topicId);
  if (!topic) return NextResponse.json({ error: "הנושא לא נמצא." }, { status: 404 });

  const existing = await learningRoadmapsRepo.findByTopic(user.id, topic.id);
  if (existing && !parsed.data.regenerate) return NextResponse.json({ roadmap: toView(existing) });
  if (!isProviderConfigured()) {
    return NextResponse.json({ error: "אין מפתח AI מחובר, ולכן אי אפשר לבנות מפת דרכים." }, { status: 503 });
  }

  try {
    const object = await generateStructuredData({
      actor: { kind: "user", userId: user.id },
      schema: roadmapSchema,
      system: [
        "אתה מתכנן תוכניות לימוד. בנה מפת דרכים לנושא חדש: שלבים שכל אחד נשען על קודמיו.",
        "התחל מהיסודות וסיים ביכולת מעשית. התלויות חייבות להיות אמיתיות — שלב תלוי רק במה שבאמת נדרש לפניו.",
        "מותר ששני שלבים יהיו מקבילים (אותה תלות). כתוב את השמות והתיאורים בעברית.",
      ].join("\n"),
      prompt: `הנושא: ${topic.title}${topic.category ? ` (תחום: ${topic.category})` : ""}`,
    });
    const nodes = normalizeRoadmap(object.nodes);
    if (nodes.length < 2) return NextResponse.json({ error: "לא הצלחנו לבנות מפת דרכים לנושא הזה." }, { status: 502 });

    const row = existing
      ? await learningRoadmapsRepo.update(user.id, existing.id, { nodes: nodes as unknown as Json, completed: [] as unknown as Json })
      : await learningRoadmapsRepo.insert({ user_id: user.id, topic_id: topic.id, nodes: nodes as unknown as Json });
    return NextResponse.json({ roadmap: toView(row) }, { status: 201 });
  } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
    console.error("[learning] roadmap failed:", err);
    return NextResponse.json({ error: "בניית מפת הדרכים נכשלה. נסה שוב." }, { status: 502 });
  }
}

const toggleSchema = z.object({ topicId: z.string().uuid(), nodeId: z.string().min(1).max(64), done: z.boolean() });

/** Marks one step done or not done. */
export async function PATCH(request: Request) {
  const auth = await requireSessionUser();
  if (auth.response) return auth.response;
  const parsed = await parseJsonBody(request, toggleSchema);
  if (parsed.error) return parsed.error;

  const row = await learningRoadmapsRepo.findByTopic(auth.user.id, parsed.data.topicId);
  if (!row) return NextResponse.json({ error: "מפת הדרכים לא נמצאה." }, { status: 404 });
  const view = toView(row);
  if (!view.nodes.some((n) => n.id === parsed.data.nodeId)) {
    return NextResponse.json({ error: "השלב לא נמצא." }, { status: 404 });
  }
  const completed = new Set(view.completed);
  if (parsed.data.done) completed.add(parsed.data.nodeId);
  else completed.delete(parsed.data.nodeId);
  const updated = await learningRoadmapsRepo.update(auth.user.id, row.id, { completed: [...completed] as unknown as Json });
  return NextResponse.json({ roadmap: toView(updated) });
}
