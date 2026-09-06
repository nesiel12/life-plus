import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDocumentProxy, extractText } from "unpdf";
import { authOptions } from "@/lib/auth";
import { getUserByEmail } from "@/lib/db/users";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { buildAtlasContext } from "@/lib/context/buildAtlasContext";
import { joinContextSections } from "@/lib/context/formatContext";
import type { AtlasContext } from "@/lib/context/types";
import { buildIntelligenceSignals, filterSignalsByCategory, rankSignals, formatSignalsForPrompt } from "@/lib/intelligence/core";
import type { SignalCategory } from "@/lib/intelligence/core";
import { currentUserActor } from "@/lib/ai/actor";
import { aiQuotaResponse } from "@/lib/api/aiErrorResponse";
import { AiQuotaExceededError } from "@/lib/ai/service";
import type { AiActor } from "@/lib/ai/quota";
import {
  generateStructuredData,
  transcribeAudio as transcribeWithProvider,
  isProviderConfigured,
  isTranscriptionConfigured,
} from "@/lib/ai";

// Torah extraction only cares about related past study/moments — same
// scope as before this milestone (context.relevantMemory alone), now
// expressed as a category filter instead of hand-picking one AtlasContext
// field (docs/ATLAS_ARCHITECTURE_VISION.md §9).
const RELEVANT_CATEGORIES: SignalCategory[] = ["memory"];

export const runtime = "nodejs";
export const maxDuration = 60;

const RATE_LIMIT = { limit: 10, windowMs: 5 * 60 * 1000 }; // 10 uploads / 5 min

const MAX_FILE_BYTES = 25 * 1024 * 1024; // Whisper's own limit; also a sane cap for PDFs
const MAX_TEXT_CHARS_FOR_LLM = 15_000; // keep the summarization call bounded

const extractedShiurSchema = z.object({
  topic: z.string().describe("נושא קצר וממוקד של השיעור/הטקסט, בעברית"),
  source: z
    .string()
    .describe("המקור התורני (מסכת, פרק בתנ״ך, ספר הלכה וכו') אם ניתן לזהות, אחרת תיאור כללי"),
  summary: z.string().describe("סיכום תמציתי של התוכן, 2-4 משפטים, בעברית"),
});

interface ExtractionResult {
  topic: string;
  source: string;
  summary: string;
  durationMinutes?: number;
}

async function extractPdfText(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocumentProxy(buffer);
  const { text } = await extractText(pdf, { mergePages: true });
  return text.trim();
}

async function transcribeAudio(
  file: File,
  actor: AiActor
): Promise<{ text: string; durationMinutes?: number }> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  const result = await transcribeWithProvider(buffer, actor);
  return {
    text: result.text.trim(),
    durationMinutes: result.durationInSeconds ? Math.round(result.durationInSeconds / 60) : undefined,
  };
}

function honestFallback(fileName: string, rawText: string): ExtractionResult {
  const snippet = rawText.slice(0, 300).trim();
  return {
    topic: fileName,
    source: "לא זוהה אוטומטית (אין מפתח AI מחובר)",
    summary: snippet
      ? `${snippet}${rawText.length > 300 ? "…" : ""}`
      : "לא הצלחנו לחלץ טקסט מהקובץ, ואין מפתח AI מחובר לניתוח נוסף.",
  };
}

async function summarize(
  rawText: string,
  fileName: string,
  context: AtlasContext | undefined,
  actor: AiActor
): Promise<ExtractionResult> {
  if (!rawText) {
    return {
      topic: fileName,
      source: "לא זוהה",
      summary: "לא נמצא תוכן טקסטואלי בקובץ שהועלה.",
    };
  }

  if (!isProviderConfigured()) {
    return honestFallback(fileName, rawText);
  }

  const signals = context ? filterSignalsByCategory(buildIntelligenceSignals(context), RELEVANT_CATEGORIES) : [];
  const formattedSignals = formatSignalsForPrompt(rankSignals(signals));
  const relatedSessionsBlock = formattedSignals
    ? `שיעורים ורגעים קודמים שעשויים להיות קשורים, מדורגים לפי חשיבות:\n${formattedSignals}`
    : "";

  try {
    const object = await generateStructuredData({
      actor,
      schema: extractedShiurSchema,
      system: joinContextSections([
        "אתה עוזר שמנתח תמלול או טקסט של שיעור תורני ומחלץ ממנו נושא, מקור וסיכום תמציתי. " +
          "ענה אך ורק על סמך התוכן שסופק, ללא המצאות.",
        relatedSessionsBlock,
      ]),
      prompt: rawText.slice(0, MAX_TEXT_CHARS_FOR_LLM),
    });
    return object;
  } catch (err) {
    // A quota rejection is not an extraction failure and must not be
    // absorbed into the fallback — the caller turns it into a 429 with a
    // real explanation, whereas honestFallback would hand back a plausible
    // stub and hide the fact that nothing was generated.
    if (err instanceof AiQuotaExceededError) throw err;
    return honestFallback(fileName, rawText);
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`torah-extract:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  // Resolved from the session, never from the request body.
  const actor = await currentUserActor();

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "הקובץ גדול מדי (מקסימום 25MB)." }, { status: 413 });
  }

  const user = await getUserByEmail(session.user.email);

  try {
    if (file.type === "application/pdf") {
      const rawText = await extractPdfText(file);
      const context = user ? await buildAtlasContext(user.id, { query: rawText.slice(0, 2000) }) : undefined;
      const result = await summarize(rawText, file.name, context, actor);
      return NextResponse.json(result);
    }

    if (file.type.startsWith("audio/")) {
      // Transcription is OpenAI/Whisper-specific — distinct from
      // isProviderConfigured() (chat/text generation, which Gemini also
      // covers) since a Gemini-only setup doesn't enable this capability.
      if (!isTranscriptionConfigured()) {
        return NextResponse.json(
          { error: "תמלול אודיו דורש מפתח OpenAI מחובר (Whisper). פנה למנהל המערכת." },
          { status: 503 }
        );
      }
      const { text: rawText, durationMinutes } = await transcribeAudio(file, actor);
      const context = user ? await buildAtlasContext(user.id, { query: rawText.slice(0, 2000) }) : undefined;
      const result = await summarize(rawText, file.name, context, actor);
      return NextResponse.json({ ...result, durationMinutes });
    }

    return NextResponse.json({ error: "סוג קובץ לא נתמך. יש להעלות PDF או קובץ אודיו." }, { status: 400 });
  } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
    return NextResponse.json({ error: "עיבוד הקובץ נכשל. נסה שוב." }, { status: 500 });
  }
}
