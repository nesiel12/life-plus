import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getUserByEmail } from "@/lib/db/users";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { rabbisRepo } from "@/lib/db/rabbis";
import { booksRepo } from "@/lib/db/books";
import { kgEdgesRepo } from "@/lib/db/kgEdges";
import { toBook, toRabbi } from "@/lib/mappers";
import { generateStructuredData, isProviderConfigured } from "@/lib/ai";
import { currentUserActor } from "@/lib/ai/actor";
import { aiQuotaResponse } from "@/lib/api/aiErrorResponse";
import { eraLabel, hebrewOnly, hebrewProse } from "@/lib/torah/hebrew";
import {
  findLibraryBook,
  findLibraryRabbi,
  mergeLineage,
  mergeWorks,
  safeHttpUrl,
  youtubeChannelHref,
  type LineageEntry,
  type RabbiLocation,
  type RabbiWork,
  type SuggestedLink,
} from "@/lib/torah/rabbiProfile";
import { findSefariaAuthorSlug, sefariaAuthor, type SefariaAuthorProfile } from "@/lib/torah/sources/sefariaAuthors";
import { linkBookAuthor } from "@/lib/torah/library";
import {
  AI_CONFIDENCE_CAP,
  RABBI_PROFILE_SYSTEM_PROMPT,
  rabbiProfileSchema,
} from "@/lib/torah/enrichmentPrompts";
import type { Database, Json } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 60;

type RabbiRow = Database["public"]["Tables"]["rabbis"]["Row"];
type RabbiUpdate = Database["public"]["Tables"]["rabbis"]["Update"];
type KgEdgeInsert = Database["public"]["Tables"]["kg_edges"]["Insert"];

const RATE_LIMIT = { limit: 10, windowMs: 5 * 60 * 1000 };

/**
 * Builds a rabbi's full profile — biography, background, lineage, bookshelf.
 *
 * SEFARIA FIRST, AI SECOND, HEBREW THROUGHOUT.
 *   1. The rabbi's Sefaria author record (found by stored slug, or by Hebrew
 *      name) supplies what is recorded: Hebrew name, years, era, Hebrew bio,
 *      sourced teacher/student links, and the works in Sefaria's library.
 *      These are stored with origin 'import'.
 *   2. The model writes the rich Hebrew biography and background, grounded on
 *      those facts, and fills gaps — Hebrew places, a timeline, lineage and
 *      works Sefaria does not have (modern rabbis mostly). Everything it adds
 *      is origin 'ai' with its confidence, capped below a record's.
 *   3. Contact details are never generated. A website or channel the model is
 *      sure of lands in suggested_links for the user to confirm.
 *
 * Relationships to rows already in the library become kg_edges: a teacher
 * the user has, a book on the shelf that this rabbi wrote.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`torah-rabbi-enrich:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const user = await getUserByEmail(session.user.email);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const force = new URL(request.url).searchParams.get("force") === "1";

  const row = await rabbisRepo.get(user.id, id);
  if (!row) return NextResponse.json({ error: "הרב לא נמצא." }, { status: 404 });

  if (!force && hebrewOnly(row.bio) && row.last_synced_at) {
    return NextResponse.json({ rabbi: toRabbi(row), cached: true });
  }

  const refs = (row.external_refs ?? {}) as Record<string, Json>;
  const sefariaRefs = (refs.sefaria ?? {}) as Record<string, Json>;
  const displayName = hebrewOnly(row.hebrew_name) ?? row.name;

  const slug =
    (typeof sefariaRefs.slug === "string" ? sefariaRefs.slug : null) ??
    (await findSefariaAuthorSlug(displayName).catch(() => null));
  const sefaria = slug ? await sefariaAuthor(slug).catch(() => null) : null;

  const patch = sefariaPatch(row, sefaria, refs, sefariaRefs, force);

  if (!isProviderConfigured()) {
    if (!sefaria) {
      return NextResponse.json({
        rabbi: toRabbi(row),
        error: "אין מפתח AI מחובר, והרב לא נמצא בספריא — אין ממה לבנות פרופיל.",
      });
    }
    const updated = await rabbisRepo.update(user.id, id, patch);
    await linkLibrary(user.id, updated);
    return NextResponse.json({ rabbi: toRabbi(updated) });
  }

  try {
    const actor = await currentUserActor();
    const object = await generateStructuredData({
      actor,
      schema: rabbiProfileSchema,
      system: RABBI_PROFILE_SYSTEM_PROMPT,
      prompt: buildPrompt(displayName, row, sefaria),
    });

    const aiLineage: LineageEntry[] = [
      ...object.teachers.map((p) => ({ ...p, relation: "teacher" as const })),
      ...object.students.map((p) => ({ ...p, relation: "student" as const })),
    ]
      .map((p) => ({ name: hebrewProse(p.name), relation: p.relation, confidence: p.confidence }))
      .filter((p): p is { name: string; relation: "teacher" | "student"; confidence: number } => Boolean(p.name))
      .map((p) => ({ ...p, origin: "ai" as const, confidence: capConfidence(p.confidence) }));

    const aiWorks: RabbiWork[] = object.works.flatMap((w) => {
      const title = hebrewProse(w.title);
      if (!title) return [];
      return [
        {
          title,
          description: hebrewProse(w.description),
          year: w.year > 0 ? w.year : undefined,
          origin: "ai" as const,
          confidence: capConfidence(w.confidence),
        },
      ];
    });

    const locations: RabbiLocation[] = object.locations
      .flatMap((l) => {
        const place = hebrewProse(l.place);
        if (!place) return [];
        return [
          {
            place,
            fromYear: l.fromYear > 0 ? l.fromYear : undefined,
            toYear: l.toYear > 0 ? l.toYear : undefined,
            note: hebrewProse(l.note),
          },
        ];
      })
      .slice(0, 6);

    const suggestedLinks: SuggestedLink[] = [];
    const website = safeHttpUrl(object.websiteUrl);
    if (website && !row.website_url) suggestedLinks.push({ kind: "website", url: website, confidence: 0.6 });
    const channel = youtubeChannelHref(object.youtubeChannelUrl);
    if (channel && !row.youtube_channel_url) suggestedLinks.push({ kind: "youtube", url: channel, confidence: 0.6 });

    const achievements = object.achievements
      .map((a) => hebrewProse(a))
      .filter((a): a is string => Boolean(a))
      .slice(0, 6);

    const final: RabbiUpdate = {
      ...patch,
      hebrew_name: patch.hebrew_name ?? hebrewOnly(row.hebrew_name) ?? hebrewProse(object.hebrewName) ?? null,
      // The user's own title is kept; the model's only fills an empty one.
      title: row.title ?? hebrewProse(object.title) ?? null,
      // The model's rich biography, grounded on Sefaria's bio when there is
      // one; Sefaria's short bio remains the fallback when the model's is not
      // usable Hebrew.
      bio: hebrewProse(object.bio) ?? patch.bio ?? hebrewOnly(row.bio) ?? null,
      historical_context: hebrewProse(object.historicalContext) ?? hebrewOnly(row.historical_context) ?? null,
      achievements: achievements.length > 0 ? achievements : ((row.achievements as Json) ?? []),
      era: patch.era ?? eraLabel(object.era) ?? row.era ?? null,
      is_contemporary: object.isContemporary,
      // Recorded years win; the model's only fill what Sefaria did not have.
      birth_year: patch.birth_year ?? row.birth_year ?? (object.birthYear > 0 ? object.birthYear : null),
      death_year: patch.death_year ?? row.death_year ?? (object.deathYear > 0 ? object.deathYear : null),
      birth_place: hebrewOnly(row.birth_place) ?? hebrewProse(object.birthPlace) ?? null,
      death_place: hebrewOnly(row.death_place) ?? hebrewProse(object.deathPlace) ?? null,
      locations: locations.length > 0 ? (locations as unknown as Json) : row.locations,
      lineage: mergeLineage(currentLineage(patch, row), aiLineage) as unknown as Json,
      works: mergeWorks(currentWorks(patch, row), aiWorks) as unknown as Json,
      suggested_links: suggestedLinks as unknown as Json,
    };

    const updated = await rabbisRepo.update(user.id, id, final);
    const books = await linkLibrary(user.id, updated);
    return NextResponse.json({ rabbi: toRabbi(updated), books });
  } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
    // The Sefaria half is still worth keeping when the model fails.
    if (sefaria) {
      const updated = await rabbisRepo.update(user.id, id, patch).catch(() => row);
      return NextResponse.json({ rabbi: toRabbi(updated), error: "הביוגרפיה המורחבת נכשלה. הנתונים מספריא נשמרו." });
    }
    return NextResponse.json({ rabbi: toRabbi(row), error: "בניית הפרופיל נכשלה. נסה שוב." });
  }
}

function capConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(AI_CONFIDENCE_CAP, Math.max(0, value));
}

function currentLineage(patch: RabbiUpdate, row: RabbiRow): LineageEntry[] {
  return ((patch.lineage ?? row.lineage) as unknown as LineageEntry[]) ?? [];
}

function currentWorks(patch: RabbiUpdate, row: RabbiRow): RabbiWork[] {
  return ((patch.works ?? row.works) as unknown as RabbiWork[]) ?? [];
}

/** Everything Sefaria's record contributes, as a row patch. */
function sefariaPatch(
  row: RabbiRow,
  sefaria: SefariaAuthorProfile | null,
  refs: Record<string, Json>,
  sefariaRefs: Record<string, Json>,
  force: boolean
): RabbiUpdate {
  const existingLineage = Array.isArray(row.lineage) ? (row.lineage as unknown as LineageEntry[]) : [];
  const existingWorks = Array.isArray(row.works) ? (row.works as unknown as RabbiWork[]) : [];
  // A forced refresh drops the previous AI-derived entries so a corrected
  // model answer replaces them; the user's own and Sefaria's are kept.
  const keptLineage = force ? existingLineage.filter((e) => e.origin !== "ai") : existingLineage;
  const keptWorks = force ? existingWorks.filter((w) => w.origin !== "ai") : existingWorks;

  const patch: RabbiUpdate = {
    last_synced_at: new Date().toISOString(),
    lineage: keptLineage as unknown as Json,
    works: keptWorks as unknown as Json,
  };
  if (!sefaria) return patch;

  return {
    ...patch,
    hebrew_name: hebrewOnly(row.hebrew_name) ?? sefaria.hebrewName ?? null,
    // Sefaria's value, else whatever the row already had — the no-AI path
    // saves this patch directly and must not blank a field Sefaria lacks.
    bio: sefaria.bio ?? hebrewOnly(row.bio) ?? null,
    birth_year: sefaria.birthYear ?? row.birth_year ?? null,
    death_year: sefaria.deathYear ?? row.death_year ?? null,
    era: eraLabel(sefaria.era) ?? row.era ?? null,
    lineage: mergeLineage(keptLineage, sefaria.lineage) as unknown as Json,
    works: mergeWorks(keptWorks, sefaria.works) as unknown as Json,
    external_refs: {
      ...refs,
      sefaria: {
        ...sefariaRefs,
        slug: sefaria.slug,
        hebrewAliases: sefaria.hebrewAliases,
        hebrewWikipediaUrl: sefaria.hebrewWikipediaUrl ?? null,
      },
    },
  };
}

function buildPrompt(displayName: string, row: RabbiRow, sefaria: SefariaAuthorProfile | null): string {
  const facts = [
    `שם: ${displayName}`,
    row.title ? `תפקיד: ${row.title}` : null,
    hebrewOnly(row.notes) ? `הערות הלומד: ${row.notes}` : null,
  ];
  if (sefaria) {
    const teachers = sefaria.lineage.filter((l) => l.relation === "teacher").map((l) => l.name);
    const students = sefaria.lineage.filter((l) => l.relation === "student").map((l) => l.name);
    facts.push(
      "נתונים מספריא:",
      sefaria.hebrewName ? `שם בספריא: ${sefaria.hebrewName}` : null,
      sefaria.hebrewAliases.length ? `כינויים: ${sefaria.hebrewAliases.join(", ")}` : null,
      sefaria.birthYear ? `שנת לידה: ${sefaria.birthYear}` : null,
      sefaria.deathYear ? `שנת פטירה: ${sefaria.deathYear}` : null,
      eraLabel(sefaria.era) ? `תקופה: ${eraLabel(sefaria.era)}` : null,
      sefaria.bio ? `ביוגרפיה קצרה: ${sefaria.bio}` : null,
      teachers.length ? `רבותיו: ${teachers.join(", ")}` : null,
      students.length ? `תלמידיו: ${students.join(", ")}` : null,
      sefaria.works.length ? `ספריו בספריא: ${sefaria.works.map((w) => w.title).join(", ")}` : null
    );
  }
  return facts.filter(Boolean).join("\n");
}

/**
 * Turns profile facts into graph edges where both ends are in the library.
 *
 * Returns the books whose author link changed, so the client store can update
 * them without a refetch.
 */
async function linkLibrary(userId: string, rabbi: RabbiRow) {
  const [rabbiRows, bookRows] = await Promise.all([rabbisRepo.list(userId), booksRepo.list(userId)]);
  const rabbis = rabbiRows.map(toRabbi).filter((r) => r.id !== rabbi.id);
  const books = bookRows.map(toBook);
  const edges: KgEdgeInsert[] = [];

  const lineage = (Array.isArray(rabbi.lineage) ? rabbi.lineage : []) as unknown as LineageEntry[];
  for (const entry of lineage) {
    const match = findLibraryRabbi(entry, rabbis);
    if (!match) continue;
    const [from, to] = entry.relation === "teacher" ? [rabbi.id, match.id] : [match.id, rabbi.id];
    edges.push({
      user_id: userId,
      from_type: "rabbi",
      from_id: from,
      relation: "taught_by",
      to_type: "rabbi",
      to_id: to,
      origin: entry.origin,
      weight: entry.confidence,
      evidence: { via: "rabbi_enrich", sefariaSlug: entry.sefariaSlug ?? null },
    });
  }

  const changedBooks = [];
  const works = (Array.isArray(rabbi.works) ? rabbi.works : []) as unknown as RabbiWork[];
  for (const work of works) {
    const book = findLibraryBook(work, books);
    if (!book) continue;
    const bookRow = bookRows.find((b) => b.id === book.id)!;
    if (bookRow.author_rabbi_id === rabbi.id) continue;
    // A recorded authorship claims the book outright; a model's guess only
    // draws a weighted edge and leaves books.author_rabbi_id to the user.
    if (work.origin !== "ai" && !bookRow.author_rabbi_id) {
      changedBooks.push(toBook(await linkBookAuthor(userId, bookRow, rabbi, work.origin, work.confidence)));
      continue;
    }
    edges.push({
      user_id: userId,
      from_type: "book",
      from_id: book.id,
      relation: "authored_by",
      to_type: "rabbi",
      to_id: rabbi.id,
      origin: work.origin,
      weight: work.confidence,
      evidence: { via: "rabbi_enrich" },
    });
  }

  // Never demote an edge: a link the user drew (or Sefaria recorded) must not
  // be overwritten by the model's weaker claim about the same pair, which the
  // idempotent upsert would otherwise do.
  const RANK = { user: 3, import: 2, ai: 1 } as const;
  const existing = await kgEdgesRepo.listForNode(userId, { type: "rabbi", id: rabbi.id }).catch(() => []);
  const stronger = new Map(
    existing.map((e) => [`${e.from_type}:${e.from_id}:${e.relation}:${e.to_type}:${e.to_id}`, RANK[e.origin]])
  );
  const writable = edges.filter(
    (e) => (stronger.get(`${e.from_type}:${e.from_id}:${e.relation}:${e.to_type}:${e.to_id}`) ?? 0) <= RANK[e.origin ?? "user"]
  );

  await kgEdgesRepo.upsertMany(writable).catch(() => []);
  return changedBooks;
}
