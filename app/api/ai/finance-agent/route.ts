import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { generateStructuredData, isProviderConfigured } from "@/lib/ai";
import {
  CATEGORIZATION_SYSTEM,
  CFO_SYSTEM,
  categorizationSchema,
  cfoAnalysisSchema,
} from "@/lib/ai/agents/financeAgent";
import { buildSnapshot, formatSnapshotForPrompt } from "@/lib/finances/analyze";
import { EXPENSE_KEYS, INCOME_KEYS, isCategoryKey } from "@/lib/finances/categories";

export const runtime = "nodejs";
export const maxDuration = 60;

const RATE_LIMIT = { limit: 20, windowMs: 10 * 60 * 1000 };
const MAX_CATEGORIZE = 200;

const requestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("categorize"),
    transactions: z
      .array(
        z.object({
          title: z.string().max(200),
          amount: z.number(),
          type: z.enum(["income", "expense"]),
          hint: z.string().max(100).optional(),
        })
      )
      .max(MAX_CATEGORIZE),
  }),
  z.object({
    mode: z.literal("analyze"),
    transactions: z
      .array(
        z.object({
          amount: z.number(),
          type: z.enum(["income", "expense"]),
          category: z.string(),
          date: z.string(),
        })
      )
      .max(5000),
    month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  }),
]);

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`finance-agent:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const parsed = await parseJsonBody(request, requestSchema);
  if (parsed.error) return parsed.error;

  if (!isProviderConfigured()) {
    return NextResponse.json(
      { error: "ניתוח פיננסי דורש מפתח OpenAI או Gemini מחובר. פנה למנהל המערכת." },
      { status: 503 }
    );
  }

  const body = parsed.data;

  try {
    if (body.mode === "categorize") {
      if (body.transactions.length === 0) {
        return NextResponse.json({ mode: "categorize" as const, categories: [] });
      }

      const listing = body.transactions
        .map((t, i) => `${i}. [${t.type === "income" ? "הכנסה" : "הוצאה"}] ${t.title}${t.hint ? ` (${t.hint})` : ""} — ${t.amount}`)
        .join("\n");

      const result = await generateStructuredData({
        schema: categorizationSchema,
        system: CATEGORIZATION_SYSTEM,
        prompt: `סווג את התנועות הבאות:\n${listing}`,
      });

      // Never trust the model's key. A hallucinated category would create a
      // phantom bucket that silently fragments every downstream total.
      const byIndex = new Map(result.assignments.map((a) => [a.index, a.category]));
      const categories = body.transactions.map((t, i) => {
        const proposed = byIndex.get(i);
        if (proposed && isCategoryKey(proposed)) {
          const validForType = t.type === "income"
            ? INCOME_KEYS.includes(proposed)
            : EXPENSE_KEYS.includes(proposed);
          if (validForType) return proposed;
        }
        return t.type === "income" ? "other_income" : "other";
      });

      return NextResponse.json({ mode: "categorize" as const, categories });
    }

    // Arithmetic first, deterministically. The model only interprets.
    const snapshot = buildSnapshot(body.transactions, body.month);
    if (!snapshot) {
      return NextResponse.json({ mode: "analyze" as const, snapshot: null, analysis: null });
    }

    const analysis = await generateStructuredData({
      schema: cfoAnalysisSchema,
      system: CFO_SYSTEM,
      prompt: formatSnapshotForPrompt(snapshot).join("\n"),
    });

    return NextResponse.json({ mode: "analyze" as const, snapshot, analysis });
  } catch {
    return NextResponse.json({ error: "הניתוח הפיננסי נכשל. נסה שוב." }, { status: 502 });
  }
}
