import { NextResponse } from "next/server";
import sharp from "sharp";
import { z } from "zod";
import { requireSessionUser } from "@/lib/api/sessionUser";
import { aiQuotaResponse } from "@/lib/api/aiErrorResponse";
import { generateStructuredData, isProviderConfigured } from "@/lib/ai";
import { currentUserActor } from "@/lib/ai/actor";
import { handwritingScansRepo } from "@/lib/db/handwritingScans";
import {
  HANDWRITING_SYSTEM_PROMPT,
  countUncertain,
  handwritingPrompt,
  isUsableScan,
  mergeScanPages,
  scanQuality,
  suggestScanTitle,
  uncertainSegments,
} from "@/lib/torah/handwriting";
import { scanImagePath, scanImageUrl, uploadScanImage } from "@/lib/torah/attachments/storage";
import type { Json } from "@/types/database";

export const runtime = "nodejs";
// Vision over a full handwritten page is the slowest single call in the app.
export const maxDuration = 120;

const MAX_PAGES = 4;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

const scanSchema = z.object({
  pages: z
    .array(
      z.object({
        markdown: z.string().describe("כל מה שכתוב בדף, כ-Markdown בעברית, בדיוק כפי שנכתב"),
      })
    )
    .describe("פריט אחד לכל צילום, לפי הסדר שבו הם צורפו"),
  confidence: z.number().min(0).max(1).describe("עד כמה אתה בטוח שקראת נכון את הכתב (0 עד 1)"),
  script: z
    .enum(["handwriting", "print", "mixed", "none"])
    .describe("handwriting=כתב יד, print=דפוס, mixed=שניהם, none=אין טקסט קריא"),
});

/**
 * סורק כתב יד — a photographed page of Hebrew handwriting becomes editable text.
 *
 * Gemini Vision reads the image directly (lib/ai/service.ts's `images` path);
 * the prompt and every bit of cleanup live in lib/torah/handwriting.ts, which
 * is tested. Nothing is written into the learner's notes here: this returns a
 * DRAFT for review, and only POST /api/torah/scan/[id]/save files it.
 *
 * The page images are kept in the private torah-scans bucket, because the
 * question the review step asks — "does this text match the page?" — outlives
 * the review.
 */
export async function POST(request: Request) {
  const auth = await requireSessionUser({ key: "torah-scan", limit: 12, windowMs: 5 * 60 * 1000 });
  if (auth.response) return auth.response;
  const { user } = auth;

  if (!isProviderConfigured()) {
    return NextResponse.json({ error: "קריאת כתב יד דורשת מפתח AI מחובר (Gemini)." }, { status: 503 });
  }

  const form = await request.formData();
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  const hint = typeof form.get("hint") === "string" ? (form.get("hint") as string) : undefined;

  if (files.length === 0) return NextResponse.json({ error: "לא צורף צילום." }, { status: 400 });
  if (files.length > MAX_PAGES) {
    return NextResponse.json({ error: `אפשר עד ${MAX_PAGES} עמודים בסריקה אחת.` }, { status: 400 });
  }
  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "התמונה גדולה מדי (מקסימום 15MB)." }, { status: 413 });
    }
    if (file.type && !ACCEPTED.includes(file.type)) {
      return NextResponse.json({ error: "פורמט תמונה לא נתמך. השתמש ב-JPG, PNG או WEBP." }, { status: 400 });
    }
  }

  try {
    // Normalised to a bounded JPEG: EXIF rotation applied and stripped, HEIC
    // from an iPhone converted, and the payload kept small enough to be fast.
    // Handwriting needs more detail than printed text, so the bound is higher
    // than /api/ai/extract-image-text's and the quality less aggressive.
    const images = await Promise.all(
      files.map(async (file) => {
        const buffer = Buffer.from(await file.arrayBuffer());
        const jpeg = await sharp(buffer)
          .rotate()
          .resize(2600, 2600, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 90 })
          .toBuffer();
        return new Uint8Array(jpeg);
      })
    );

    const object = await generateStructuredData({
      actor: await currentUserActor(),
      schema: scanSchema,
      system: HANDWRITING_SYSTEM_PROMPT,
      prompt: handwritingPrompt(images.length, hint),
      images,
    });

    const markdown = mergeScanPages(object.pages.map((page) => page.markdown ?? ""));
    if (!isUsableScan(markdown)) {
      return NextResponse.json(
        {
          error:
            object.script === "none"
              ? "לא זוהה טקסט בצילום. נסה תמונה חדה יותר, באור טוב, שהדף ממלא את הפריים."
              : "לא הצלחנו לקרוא את הדף. נסה לצלם שוב מקרוב יותר ובאור אחיד.",
        },
        { status: 422 }
      );
    }

    const uncertain = countUncertain(markdown);
    const title = suggestScanTitle(markdown);
    const scan = await handwritingScansRepo.insert({
      user_id: user.id,
      markdown,
      title,
      page_count: images.length,
      confidence: object.confidence,
      uncertain_count: uncertain,
      status: "draft",
    });

    // Best-effort: the text is the product, and a storage hiccup must not
    // throw away a reading the learner already waited for.
    const storagePaths: string[] = [];
    await Promise.all(
      images.map(async (bytes, index) => {
        const path = scanImagePath(user.id, scan.id, index);
        try {
          await uploadScanImage(path, bytes);
          storagePaths[index] = path;
        } catch (err) {
          console.error("[scan] image upload failed:", err);
        }
      })
    );
    const savedPaths = storagePaths.filter(Boolean);
    if (savedPaths.length > 0) {
      await handwritingScansRepo.update(user.id, scan.id, { storage_paths: savedPaths as unknown as Json });
    }

    const imageUrls = (await Promise.all(savedPaths.map((path) => scanImageUrl(path)))).filter(
      (url): url is string => Boolean(url)
    );

    return NextResponse.json({
      scan: {
        id: scan.id,
        markdown,
        title,
        pageCount: images.length,
        confidence: object.confidence,
        uncertainCount: uncertain,
        uncertainSegments: uncertainSegments(markdown).slice(0, 6),
        quality: scanQuality(object.confidence, uncertain, markdown),
        script: object.script,
        imageUrls,
      },
    });
  } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
    console.error("[scan] failed:", err);
    return NextResponse.json({ error: "קריאת הדף נכשלה. נסה שוב עם צילום ברור יותר." }, { status: 500 });
  }
}
