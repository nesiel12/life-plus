import { createHash } from "node:crypto";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { generateStructuredData, isProviderConfigured } from "@/lib/ai";
import { currentUserActor } from "@/lib/ai/actor";
import type { AiActor } from "@/lib/ai/quota";
import { articleExtractsRepo } from "@/lib/db/articleExtracts";
import { clampKeyParagraphs, paragraphsFromHtml } from "@/lib/learning/articleExtract";
import { ArticleExtractRequestSchema, ArticleKeyParagraphsSchema } from "@/lib/validations/learning";
import type { Json } from "@/types/database";

export const runtime = "nodejs";
// A real page fetch + Readability parse + one AI call, run at most once per
// URL ever (cached after) — same ballpark as the masterclass lesson
// generation route, not a quick call.
export const maxDuration = 30;

const RATE_LIMIT = { limit: 20, windowMs: 5 * 60 * 1000 };
const FETCH_TIMEOUT_MS = 10_000;
// Keeps the prompt bounded for a long article — the AI only needs enough of
// the piece to pick a handful of genuinely key paragraphs, not the whole
// thing verbatim.
const MAX_PARAGRAPH_CHARS_FOR_PROMPT = 12_000;

const EXTRACTION_FAILED = "לא הצלחנו לחלץ את התוכן מהכתבה הזו";

export interface ArticleExtractResponse {
  title: string | null;
  paragraphs: string[];
  keyParagraphIndices: number[];
  keyParagraphNotes: Record<number, string>;
}

function hashUrl(url: string): string {
  return createHash("sha256").update(url.trim()).digest("hex");
}

async function fetchArticleHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "User-Agent": "Mozilla/5.0 (compatible; LifePlusReader/1.0)" },
  });
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("html")) throw new Error(`not html: ${contentType}`);
  return res.text();
}

async function pickKeyParagraphs(paragraphs: string[], actor: AiActor) {
  if (!isProviderConfigured() || paragraphs.length === 0) return { indices: [] as number[], notes: {} as Record<number, string> };

  let budget = MAX_PARAGRAPH_CHARS_FOR_PROMPT;
  const numbered: string[] = [];
  for (let i = 0; i < paragraphs.length && budget > 0; i++) {
    numbered.push(`[${i}] ${paragraphs[i]}`);
    budget -= paragraphs[i].length;
  }

  try {
    const result = await generateStructuredData({
      schema: ArticleKeyParagraphsSchema,
      actor,
      operation: "structured",
      system:
        "אתה עוזר קריאה שמסמן את הפסקאות החשובות ביותר בכתבה עבור לומד. תבחר עד 4 פסקאות (לפי המספור בסוגריים מרובעים) שהן הכי מהותיות להבנת הכתבה, ולכל אחת כתוב הערה קצרה אחת (עברית) שמסבירה למה היא חשובה. אל תמציא מספר שלא מופיע ברשימה.",
      prompt: numbered.join("\n\n"),
    });
    return clampKeyParagraphs(paragraphs, result.keyParagraphs);
  } catch {
    // Highlighting is a bonus on top of a working reader, not a
    // precondition for one — a quota/provider failure here degrades to
    // "no highlights," never to failing the whole extraction.
    return { indices: [] as number[], notes: {} as Record<number, string> };
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`article-extract:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const parsed = await parseJsonBody(request, ArticleExtractRequestSchema);
  if (parsed.error) return parsed.error;
  const { url } = parsed.data;
  const urlHash = hashUrl(url);

  const cached = await articleExtractsRepo.findByUrlHash(urlHash);
  if (cached) {
    return NextResponse.json({
      title: cached.title,
      paragraphs: cached.paragraphs as unknown as string[],
      keyParagraphIndices: cached.key_paragraph_indices as unknown as number[],
      keyParagraphNotes: cached.key_paragraph_notes as unknown as Record<number, string>,
    } satisfies ArticleExtractResponse);
  }

  let html: string;
  try {
    html = await fetchArticleHtml(url);
  } catch (err) {
    console.error("[learning/article/extract] fetch failed:", err);
    return NextResponse.json({ error: EXTRACTION_FAILED }, { status: 502 });
  }

  let title: string | null = null;
  let paragraphs: string[] = [];
  try {
    const dom = new JSDOM(html, { url });
    const article = new Readability(dom.window.document).parse();
    if (!article?.content) throw new Error("no readable content");
    title = article.title ?? null;
    paragraphs = paragraphsFromHtml(article.content);
    if (paragraphs.length === 0) throw new Error("no paragraphs extracted");
  } catch (err) {
    console.error("[learning/article/extract] readability failed:", err);
    return NextResponse.json({ error: EXTRACTION_FAILED }, { status: 502 });
  }

  const actor = await currentUserActor();
  const { indices, notes } = await pickKeyParagraphs(paragraphs, actor);

  await articleExtractsRepo.insert({
    urlHash,
    sourceUrl: url,
    title,
    paragraphs: paragraphs as unknown as Json,
    keyParagraphIndices: indices as unknown as Json,
    keyParagraphNotes: notes as unknown as Json,
  });

  return NextResponse.json({ title, paragraphs, keyParagraphIndices: indices, keyParagraphNotes: notes } satisfies ArticleExtractResponse);
}
