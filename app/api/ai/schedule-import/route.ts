import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getUserByEmail } from "@/lib/db/users";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { aiQuotaResponse } from "@/lib/api/aiErrorResponse";
import { generateStructuredData, isProviderConfigured } from "@/lib/ai";
import { currentUserActor } from "@/lib/ai/actor";
import {
  SCHEDULE_IMPORT_SYSTEM_PROMPT,
  findOverlaps,
  normalizeImportedBlocks,
  scheduleImportSchema,
} from "@/lib/schedule/importSchedule";
import { extractDocumentText } from "@/lib/schedule/extractDocumentText";

export const runtime = "nodejs";
// Above the vision path's own 90s abort, so the app's timeout fires first and
// the user gets a real message instead of a platform kill.
export const maxDuration = 120;

// A vision call is the most expensive thing a user can trigger here, and the
// output is a proposal they still have to confirm — so the limit is tight.
const RATE_LIMIT = { limit: 8, windowMs: 10 * 60 * 1000 };

/** Generous for a timetable, small enough that one request can't exhaust memory. */
const MAX_TEXT_LENGTH = 20_000;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"]);

/**
 * Reads a timetable and proposes routine blocks.
 *
 * Proposal only — nothing is written here. The response goes to a preview the
 * user edits and confirms, and a separate Server Action does the writing.
 * Same "propose, then a distinct confirm mutates" shape the calendar agent
 * already uses, and for the same reason: an AI misreading a grid should cost
 * a glance, not a wrecked timetable.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(
    `schedule-import:${session.user.email}`,
    RATE_LIMIT.limit,
    RATE_LIMIT.windowMs
  );
  if (limited) return limited;

  const user = await getUserByEmail(session.user.email);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isProviderConfigured()) {
    return NextResponse.json(
      { error: "ייבוא מערכת שעות דורש חיבור ל-AI, שאינו מוגדר כרגע." },
      { status: 503 }
    );
  }

  let text = "";
  const images: Uint8Array[] = [];

  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const pasted = form.get("text");
      if (typeof pasted === "string") text = pasted.slice(0, MAX_TEXT_LENGTH);

      const file = form.get("file");
      if (file instanceof File) {
        if (file.size > MAX_FILE_BYTES) {
          return NextResponse.json(
            { error: "הקובץ גדול מדי. עד 8MB." },
            { status: 413 }
          );
        }
        const bytes = new Uint8Array(await file.arrayBuffer());

        if (IMAGE_TYPES.has(file.type)) {
          images.push(bytes);
        } else {
          const extracted = await extractDocumentText(bytes, file.type, file.name);
          if (!extracted) {
            return NextResponse.json(
              { error: "לא הצלחנו לקרוא את הקובץ. נסה תמונה, PDF, Word או להדביק את הטקסט." },
              { status: 415 }
            );
          }
          text = `${text}\n${extracted}`.trim().slice(0, MAX_TEXT_LENGTH);
        }
      }
    } else {
      const body = (await request.json()) as { text?: unknown };
      if (typeof body.text === "string") text = body.text.slice(0, MAX_TEXT_LENGTH);
    }
  } catch {
    return NextResponse.json({ error: "לא הצלחנו לקרוא את הבקשה." }, { status: 400 });
  }

  if (!text.trim() && images.length === 0) {
    return NextResponse.json(
      { error: "הדבק את המערכת כטקסט, או העלה תמונה או קובץ." },
      { status: 400 }
    );
  }

  try {
    const result = await generateStructuredData({
      schema: scheduleImportSchema,
      system: SCHEDULE_IMPORT_SYSTEM_PROMPT,
      prompt:
        images.length > 0
          ? `קרא את מערכת השעות שבתמונה והחזר את הבלוקים.${text.trim() ? `\n\nהקשר נוסף מהמשתמש:\n${text}` : ""}`
          : `מערכת השעות:\n\n${text}`,
      actor: await currentUserActor(),
      images: images.length > 0 ? images : undefined,
      // Reading a whole grid produces far more output than a normal
      // structured call, so it is charged like the other heavy operation.
      operation: "course_module",
    });

    const { blocks, warnings } = normalizeImportedBlocks(result);
    const overlaps = findOverlaps(blocks);

    return NextResponse.json({
      blocks,
      warnings,
      // Surfaced rather than resolved: two blocks at the same hour may be a
      // misread grid or may be genuinely how the week looks. The user knows
      // which; the app does not.
      overlaps: overlaps.map(([a, b]) => `${a.title} מתנגש עם ${b.title}`),
    });
  } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
    console.error("[schedule-import] failed:", err);
    return NextResponse.json(
      { error: "לא הצלחנו לקרוא את המערכת. נסה תמונה ברורה יותר, או להדביק את הטקסט." },
      { status: 502 }
    );
  }
}
