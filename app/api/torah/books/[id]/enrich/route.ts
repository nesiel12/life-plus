import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getUserByEmail } from "@/lib/db/users";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { booksRepo } from "@/lib/db/books";
import { toBook } from "@/lib/mappers";
import { generateStructuredData, isProviderConfigured } from "@/lib/ai";
import { currentUserActor } from "@/lib/ai/actor";
import { aiQuotaResponse } from "@/lib/api/aiErrorResponse";
import { hebrewOnly, hebrewProse } from "@/lib/torah/hebrew";
import { sefariaBook } from "@/lib/torah/sources/providers";
import { BOOK_ENRICHMENT_SYSTEM_PROMPT, bookEnrichmentSchema } from "@/lib/torah/enrichmentPrompts";
import type { Database, Json } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 60;

type BookUpdate = Database["public"]["Tables"]["books"]["Update"];

const RATE_LIMIT = { limit: 10, windowMs: 5 * 60 * 1000 };

/**
 * Fills in everything a book page needs to say about the sefer itself —
 * description, "before you start", key topics, and any Hebrew identity field
 * still missing (title, author, category).
 *
 * NATIVE HEBREW, NEVER TRANSLATED. Sefaria's Hebrew record is used as-is when
 * it has one; English provider text is never fetched into the prompt or the
 * row. When there is no Hebrew description the model writes one from Torah
 * knowledge, in Hebrew, from the start. A stored description that is not
 * Hebrew — rows added before this rule — counts as missing and is replaced.
 *
 * Cached: a book whose description, notes and topics are all present (and
 * Hebrew) returns without any AI call. ?force=1 regenerates, because the one
 * thing worse than missing text is paying to regenerate text the user has
 * already edited without being asked.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`torah-book-enrich:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const user = await getUserByEmail(session.user.email);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const force = new URL(request.url).searchParams.get("force") === "1";

  const row = await booksRepo.get(user.id, id);
  if (!row) return NextResponse.json({ error: "הספר לא נמצא." }, { status: 404 });

  const storedTopics = Array.isArray(row.key_topics) ? row.key_topics : [];
  if (!force && hebrewOnly(row.description) && hebrewOnly(row.pre_study_notes) && storedTopics.length > 0) {
    return NextResponse.json({ book: toBook(row), cached: true });
  }

  const refs = (row.external_refs ?? {}) as Record<string, Json>;
  const sefariaRef = (refs.sefaria ?? {}) as Record<string, Json>;

  // Provider first: free, factual, and — through providers.ts — Hebrew only.
  const sefaria = await sefariaBook(
    (typeof sefariaRef.id === "string" ? sefariaRef.id : null) ?? row.hebrew_title ?? row.title
  ).catch(() => null);

  // What is already known in Hebrew, from the row or from Sefaria. A user's
  // own Hebrew text outranks Sefaria's unless they asked to regenerate.
  const known = {
    hebrewTitle: hebrewOnly(row.hebrew_title) ?? sefaria?.hebrewTitle ?? hebrewOnly(row.title),
    author: hebrewOnly(row.author) ?? sefaria?.author,
    category: hebrewOnly(row.category) ?? sefaria?.categories?.[0],
    description: force ? sefaria?.description : (hebrewOnly(row.description) ?? sefaria?.description),
    year: row.published_year ?? sefaria?.publishedYear ?? undefined,
  };

  const basePatch: BookUpdate = {
    hebrew_title: known.hebrewTitle ?? null,
    author: known.author ?? null,
    category: known.category ?? null,
    published_year: known.year ?? null,
    last_synced_at: new Date().toISOString(),
  };
  if (sefaria) {
    basePatch.external_refs = {
      ...refs,
      sefaria: {
        ...sefariaRef,
        id: sefaria.externalId,
        era: sefaria.era ?? null,
        authorSlug: sefaria.authorSlug ?? null,
        compositionPlace: sefaria.compositionPlace ?? null,
      },
    };
  }

  if (!isProviderConfigured()) {
    // Still worth saving the Hebrew facts Sefaria gave us, with no model.
    const updated = await booksRepo.update(user.id, id, {
      ...basePatch,
      description: known.description ?? hebrewOnly(row.description) ?? null,
    });
    return NextResponse.json({
      book: toBook(updated),
      error: known.description ? undefined : "אין מפתח AI מחובר, ולספר אין תיאור בעברית בספריא.",
    });
  }

  try {
    const actor = await currentUserActor();
    const object = await generateStructuredData({
      actor,
      schema: bookEnrichmentSchema,
      system: BOOK_ENRICHMENT_SYSTEM_PROMPT,
      // Hebrew facts only — an English blurb in the prompt is exactly how a
      // "description" turns into a translation.
      prompt: [
        `שם הספר: ${known.hebrewTitle ?? row.title}`,
        known.author ? `מחבר: ${known.author}` : null,
        known.category ? `קטגוריה: ${known.category}` : null,
        known.year ? `שנת חיבור משוערת: ${known.year}` : null,
        sefaria?.compositionPlace ? `מקום חיבור: ${sefaria.compositionPlace}` : null,
        known.description ? `מידע מספריא: ${known.description}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    });

    const topics = object.keyTopics
      .map((topic) => hebrewProse(topic))
      .filter((topic): topic is string => Boolean(topic))
      .slice(0, 8);

    const updated = await booksRepo.update(user.id, id, {
      ...basePatch,
      hebrew_title: basePatch.hebrew_title ?? hebrewProse(object.hebrewTitle) ?? null,
      author: basePatch.author ?? hebrewProse(object.author) ?? null,
      category: basePatch.category ?? hebrewProse(object.category) ?? null,
      // Sefaria's Hebrew record (or the user's own Hebrew text) outranks
      // the model's paragraph whenever there is one.
      description: known.description ?? hebrewProse(object.description) ?? null,
      pre_study_notes: hebrewProse(object.preStudyNotes) ?? null,
      key_topics: topics,
    });

    return NextResponse.json({ book: toBook(updated) });
  } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
    return NextResponse.json({ book: toBook(row), error: "השלמת המידע נכשלה. נסה שוב." });
  }
}
