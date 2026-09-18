import "server-only";

import { booksRepo } from "@/lib/db/books";
import { rabbisRepo } from "@/lib/db/rabbis";
import { kgEdgesRepo } from "@/lib/db/kgEdges";
import { toBook, toRabbi } from "@/lib/mappers";
import { hebrewOnly } from "@/lib/torah/hebrew";
import { findLibraryBook, findLibraryRabbi, type ProfileOrigin } from "@/lib/torah/rabbiProfile";
import {
  googleBooksSearch,
  mergeExternalBooks,
  sefariaBook,
  type ExternalBook,
} from "@/lib/torah/sources/providers";
import type { Database, Json, KgOriginDb } from "@/types/database";

type BookRow = Database["public"]["Tables"]["books"]["Row"];
type RabbiRow = Database["public"]["Tables"]["rabbis"]["Row"];

// The library operations behind the investigation loop.
//
// Book → Rabbi → the Rabbi's other books → Book … only works if every hop can
// land on a real page, whether or not the user already has that book or
// rabbi. So each hop is "open or create": find the existing row (by provider
// identity first, folded Hebrew name second) and only insert when there is
// none — following the same link twice must never produce two rows.
//
// Every relationship a hop reveals is also written to kg_edges, with the
// origin of the claim it came from. The loop is how the graph grows.

/** A kg_edges origin from a profile fact's origin. The two vocabularies coincide. */
function edgeOrigin(origin: ProfileOrigin): KgOriginDb {
  return origin;
}

export interface CreateBookInput {
  title: string;
  /** The provider the user picked, when they picked one. */
  provider?: ExternalBook["provider"];
  /** Sefaria's canonical title — skips the fuzzy lookup when known. */
  sefariaTitle?: string;
  /** A Hebrew author name known from context (the rabbi page the click came from). */
  authorName?: string;
}

/**
 * Creates a book enriched from both providers.
 *
 * ENRICHMENT IS BEST-EFFORT. If both providers fail, the book is still created
 * with the title given. Losing the cover art is a disappointment; failing the
 * add because Google Books timed out is a bug.
 *
 * Hebrew throughout: the stored title is the Hebrew one whenever any source
 * has it, and author/category/description come from providers.ts, which only
 * ever returns Hebrew text. A field no provider has in Hebrew stays empty for
 * the enrich route to write natively.
 */
export async function createBookFromProviders(userId: string, input: CreateBookInput): Promise<BookRow> {
  const title = input.title.trim();
  const sefariaLookup = input.sefariaTitle ?? title;

  const [sefaria, googleResults] = await Promise.all([
    input.provider === "googleBooks" ? Promise.resolve(null) : sefariaBook(sefariaLookup).catch(() => null),
    googleBooksSearch(title, 1).catch(() => [] as ExternalBook[]),
  ]);
  const google = googleResults[0] ?? null;
  const merged = mergeExternalBooks(sefaria, google);

  const externalRefs: Record<string, Json> = {};
  if (sefaria) {
    externalRefs.sefaria = {
      id: sefaria.externalId,
      era: sefaria.era ?? null,
      authorSlug: sefaria.authorSlug ?? null,
      compositionPlace: sefaria.compositionPlace ?? null,
    };
  }
  if (google) externalRefs.googleBooks = { id: google.externalId };

  return booksRepo.insert({
    user_id: userId,
    // The title the user chose wins when it is Hebrew — they picked a
    // specific row, and silently renaming it is the kind of small betrayal
    // that makes a feature feel untrustworthy. When what they picked was a
    // non-Hebrew provider title, the Hebrew one replaces it.
    title: hebrewOnly(title) ?? merged?.hebrewTitle ?? title,
    hebrew_title: merged?.hebrewTitle ?? hebrewOnly(title) ?? null,
    author: merged?.author ?? hebrewOnly(input.authorName) ?? null,
    category: merged?.categories?.[0] ?? null,
    cover_image_url: merged?.coverImageUrl ?? null,
    published_year: merged?.publishedYear ?? null,
    description: merged?.description ?? null,
    avg_price_ils: merged?.averagePrice ?? null,
    rating: merged?.rating ?? null,
    ratings_count: merged?.ratingsCount ?? null,
    isbn: merged?.isbn ?? null,
    external_refs: externalRefs,
    last_synced_at: merged ? new Date().toISOString() : null,
  });
}

export interface OpenBookInput extends CreateBookInput {
  /** The rabbi whose bookshelf the click came from — links the author on create. */
  authorRabbiId?: string;
  /** How the rabbi↔book link is known (Sefaria's record, or a model's list). */
  authorOrigin?: ProfileOrigin;
  authorConfidence?: number;
}

/** Finds the book in the library, or creates it; links the author when known. */
export async function openOrCreateBook(userId: string, input: OpenBookInput) {
  const rows = await booksRepo.list(userId);
  const books = rows.map(toBook);
  const existing = findLibraryBook({ title: input.title, sefariaTitle: input.sefariaTitle }, books);

  let row: BookRow;
  let created = false;
  if (existing) {
    row = rows.find((r) => r.id === existing.id)!;
  } else {
    row = await createBookFromProviders(userId, input);
    created = true;
  }

  if (input.authorRabbiId && !row.author_rabbi_id) {
    const rabbi = await rabbisRepo.get(userId, input.authorRabbiId);
    if (rabbi) {
      row = await linkBookAuthor(userId, row, rabbi, input.authorOrigin ?? "import", input.authorConfidence ?? 1);
    }
  }

  return { book: toBook(row), created };
}

/** Writes books.author_rabbi_id and the authored_by edge. */
export async function linkBookAuthor(
  userId: string,
  book: BookRow,
  rabbi: RabbiRow,
  origin: ProfileOrigin,
  confidence: number
): Promise<BookRow> {
  const updated = await booksRepo.update(userId, book.id, {
    author_rabbi_id: rabbi.id,
    // A book with no Hebrew author yet takes the rabbi's Hebrew name — which
    // also repairs rows stored before the Hebrew-at-source fix with an
    // English author ("Moses Chaim Luzzatto").
    author: hebrewOnly(book.author) ?? rabbi.hebrew_name ?? rabbi.name,
  });

  await kgEdgesRepo
    .upsertMany([
      {
        user_id: userId,
        from_type: "book",
        from_id: book.id,
        relation: "authored_by",
        to_type: "rabbi",
        to_id: rabbi.id,
        origin: edgeOrigin(origin),
        weight: clampWeight(confidence),
        evidence: { via: "investigation_loop" },
      },
    ])
    // The edge is the graph's copy of a fact the book row already holds; a
    // failed edge write must not fail the navigation the user asked for.
    .catch(() => []);

  return updated;
}

export interface OpenRabbiInput {
  name: string;
  sefariaSlug?: string;
  /** The rabbi whose lineage list the click came from. */
  relatedRabbiId?: string;
  /** What the new/opened rabbi is to the related one. */
  relation?: "teacher" | "student";
  origin?: ProfileOrigin;
  confidence?: number;
}

/** Finds the rabbi in the library, or creates him; links the lineage edge when known. */
export async function openOrCreateRabbi(userId: string, input: OpenRabbiInput) {
  const rows = await rabbisRepo.list(userId);
  const existing = findLibraryRabbi({ name: input.name, sefariaSlug: input.sefariaSlug }, rows.map(toRabbi));

  let row: RabbiRow;
  let created = false;
  if (existing) {
    row = rows.find((r) => r.id === existing.id)!;
    // A rabbi added by hand has no Sefaria identity yet. Learning it here is
    // what lets the next enrichment read his real record.
    const refs = (row.external_refs ?? {}) as Record<string, Json>;
    const sefaria = (refs.sefaria ?? {}) as Record<string, Json>;
    if (input.sefariaSlug && !sefaria.slug) {
      row = await rabbisRepo.update(userId, row.id, {
        external_refs: { ...refs, sefaria: { ...sefaria, slug: input.sefariaSlug } },
      });
    }
  } else {
    const name = input.name.trim();
    row = await rabbisRepo.insert({
      user_id: userId,
      name,
      hebrew_name: hebrewOnly(name) ?? null,
      external_refs: input.sefariaSlug ? { sefaria: { slug: input.sefariaSlug } } : {},
    });
    created = true;
  }

  if (input.relatedRabbiId && input.relation && input.relatedRabbiId !== row.id) {
    // taught_by reads student → teacher.
    const [student, teacher] =
      input.relation === "teacher" ? [input.relatedRabbiId, row.id] : [row.id, input.relatedRabbiId];
    await kgEdgesRepo
      .upsertMany([
        {
          user_id: userId,
          from_type: "rabbi",
          from_id: student,
          relation: "taught_by",
          to_type: "rabbi",
          to_id: teacher,
          origin: edgeOrigin(input.origin ?? "import"),
          weight: clampWeight(input.confidence ?? 1),
          evidence: { via: "investigation_loop" },
        },
      ])
      .catch(() => []);
  }

  return { rabbi: toRabbi(row), created };
}

/**
 * The rabbi page for a book's author — the Book → Rabbi hop.
 *
 * Uses the author slug Sefaria gave when the book was added, so "רבי ישראל
 * מאיר הכהן" on the book and "החפץ חיים" already in the library resolve to
 * one person rather than two.
 */
export async function promoteBookAuthor(userId: string, bookId: string) {
  const book = await booksRepo.get(userId, bookId);
  if (!book) return { error: "הספר לא נמצא." as const };

  if (book.author_rabbi_id) {
    const rabbi = await rabbisRepo.get(userId, book.author_rabbi_id);
    if (rabbi) return { book: toBook(book), rabbi: toRabbi(rabbi), created: false };
  }

  const refs = (book.external_refs ?? {}) as { sefaria?: { authorSlug?: string | null; id?: string } };
  let authorName = hebrewOnly(book.author);
  let authorSlug = refs.sefaria?.authorSlug ?? undefined;

  // A book added before the Hebrew fix, or by hand, may have no Hebrew
  // author or no slug. One Sefaria lookup can supply both.
  if (!authorName || !authorSlug) {
    const sefaria = await sefariaBook(refs.sefaria?.id ?? book.hebrew_title ?? book.title).catch(() => null);
    authorName = authorName ?? sefaria?.author;
    authorSlug = authorSlug ?? sefaria?.authorSlug;
  }

  if (!authorName) {
    return { error: "לא ידוע מי חיבר את הספר. השלם את פרטי הספר או ערוך את שם המחבר." as const };
  }

  const { rabbi, created } = await openOrCreateRabbi(userId, { name: authorName, sefariaSlug: authorSlug });
  const rabbiRow = await rabbisRepo.get(userId, rabbi.id);
  if (!rabbiRow) return { error: "פתיחת דף הרב נכשלה. נסה שוב." as const };
  const updated = await linkBookAuthor(userId, book, rabbiRow, authorSlug ? "import" : "user", 1);

  return { book: toBook(updated), rabbi, created };
}

function clampWeight(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 1));
}
