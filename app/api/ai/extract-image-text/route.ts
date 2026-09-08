import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { generateStructuredData, isProviderConfigured } from "@/lib/ai";
import { currentUserActor } from "@/lib/ai/actor";
import { aiQuotaResponse } from "@/lib/api/aiErrorResponse";

// Photo-of-text → text. A page of a sefer, a handwritten note, a slide — the
// image goes straight to a vision model (lib/ai/service.ts's `images` path)
// which reads the Hebrew and returns it verbatim plus a one-line note of what
// it is. The caller then runs the text through /api/ai/summarize-shiur like
// any other source, so images join the same pipeline as PDF / audio / paste.

export const runtime = "nodejs";
export const maxDuration = 90;

const RATE_LIMIT = { limit: 12, windowMs: 5 * 60 * 1000 };
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

const extractionSchema = z.object({
  text: z
    .string()
    .describe("כל הטקסט הנראה בתמונה, מועתק במדויק ובסדר הקריאה. שמור על ניקוד ומראי-מקום אם קיימים."),
  description: z
    .string()
    .describe("משפט אחד: מה רואים בתמונה (עמוד גמרא, דף מקורות, כתב יד, מצגת וכו')."),
  legible: z.boolean().describe("false אם חלק ניכר מהטקסט מטושטש/חתוך/לא קריא"),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`extract-image:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  if (!isProviderConfigured()) {
    return NextResponse.json(
      { error: "קריאת טקסט מתמונה דורשת מפתח AI מחובר (Gemini או OpenAI)." },
      { status: 503 }
    );
  }

  const actor = await currentUserActor();

  const form = await request.formData();
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "לא צורפה תמונה." }, { status: 400 });
  }
  if (files.length > 5) {
    return NextResponse.json({ error: "אפשר עד 5 תמונות בבת אחת." }, { status: 400 });
  }
  for (const f of files) {
    if (f.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "תמונה גדולה מדי (מקסימום 15MB)." }, { status: 413 });
    }
    if (f.type && !ACCEPTED.includes(f.type)) {
      return NextResponse.json({ error: "פורמט תמונה לא נתמך. השתמש ב-JPG / PNG / WEBP." }, { status: 400 });
    }
  }

  try {
    // Normalise to a bounded JPEG — strips EXIF, handles HEIC from an iPhone,
    // and keeps the payload to the model small enough to be fast.
    const images = await Promise.all(
      files.map(async (f) => {
        const buf = Buffer.from(await f.arrayBuffer());
        const jpeg = await sharp(buf)
          .rotate()
          .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 82 })
          .toBuffer();
        return new Uint8Array(jpeg);
      })
    );

    const result = await generateStructuredData({
      actor,
      schema: extractionSchema,
      system:
        "אתה מחלץ טקסט מתמונות. העתק את כל הטקסט הנראה בתמונה במדויק, בעברית או בשפת המקור, " +
        "בסדר הקריאה הנכון. אל תתרגם, אל תפרש ואל תוסיף. אם יש כמה תמונות — זו סדרה של עמודים, " +
        "החזר את הטקסט של כולן ברצף.",
      prompt: "חלץ את הטקסט מהתמונות המצורפות.",
      images,
    });

    return NextResponse.json(result);
  } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
    return NextResponse.json({ error: "קריאת הטקסט מהתמונה נכשלה. נסה תמונה ברורה יותר." }, { status: 500 });
  }
}
