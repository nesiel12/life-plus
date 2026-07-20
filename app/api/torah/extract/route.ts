import { generateObject, experimental_transcribe as transcribe } from "ai";
import { openai } from "@ai-sdk/openai";
import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDocumentProxy, extractText } from "unpdf";
import { authOptions } from "@/lib/auth";
import { rateLimitResponse } from "@/lib/api/rateLimit";

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

async function transcribeAudio(file: File): Promise<{ text: string; durationMinutes?: number }> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  const result = await transcribe({ model: openai.transcription("whisper-1"), audio: buffer });
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

async function summarize(rawText: string, fileName: string): Promise<ExtractionResult> {
  if (!rawText) {
    return {
      topic: fileName,
      source: "לא זוהה",
      summary: "לא נמצא תוכן טקסטואלי בקובץ שהועלה.",
    };
  }

  if (!process.env.OPENAI_API_KEY) {
    return honestFallback(fileName, rawText);
  }

  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: extractedShiurSchema,
      system:
        "אתה עוזר שמנתח תמלול או טקסט של שיעור תורני ומחלץ ממנו נושא, מקור וסיכום תמציתי. " +
        "ענה אך ורק על סמך התוכן שסופק, ללא המצאות.",
      prompt: rawText.slice(0, MAX_TEXT_CHARS_FOR_LLM),
    });
    return object;
  } catch {
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

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "הקובץ גדול מדי (מקסימום 25MB)." }, { status: 413 });
  }

  try {
    if (file.type === "application/pdf") {
      const rawText = await extractPdfText(file);
      const result = await summarize(rawText, file.name);
      return NextResponse.json(result);
    }

    if (file.type.startsWith("audio/")) {
      if (!process.env.OPENAI_API_KEY) {
        return NextResponse.json(
          { error: "תמלול אודיו דורש מפתח AI מחובר. פנה למנהל המערכת." },
          { status: 503 }
        );
      }
      const { text: rawText, durationMinutes } = await transcribeAudio(file);
      const result = await summarize(rawText, file.name);
      return NextResponse.json({ ...result, durationMinutes });
    }

    return NextResponse.json({ error: "סוג קובץ לא נתמך. יש להעלות PDF או קובץ אודיו." }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "עיבוד הקובץ נכשל. נסה שוב." }, { status: 500 });
  }
}
