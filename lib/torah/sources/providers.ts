import "server-only";

import { getJson } from "@/lib/torah/sources/http";
import { hebrewOnly, isHebrewText } from "@/lib/torah/hebrew";

// External book/text providers for the "ספרים" smart hub — Sefaria for the
// texts themselves, Google Books for cover art and commercial metadata.
//
// ONE SHARED CONTRACT, deliberately. Every provider here returns the same
// `ExternalBook` shape and the same "null on failure, never throw" behaviour,
// because the hub's job is to enrich a book the user is adding, and a
// provider being down must degrade to "we added it with the title you typed"
// — never to a failed add. The user's own library is the source of truth;
// these are decorations on it.
//
// HEBREW AT THE SOURCE. Every human-readable field in ExternalBook — title,
// author, categories, description — is Hebrew or absent. Sefaria publishes
// parallel `he*` fields and those are the only ones read; an English
// description is never stored and never translated. Where a provider has no
// Hebrew text, the field stays empty and the enrich route writes Hebrew
// natively (app/api/torah/books/[id]/enrich). This is enforced here, at
// parse time, so nothing downstream has to remember to check.
//
// Both APIs are public and keyless for the calls used here. Google Books
// accepts an optional key for a higher quota; when GOOGLE_BOOKS_API_KEY is
// absent the same request still works at the anonymous rate limit, so the
// feature is not gated on configuring one.

const SEFARIA_BASE = "https://www.sefaria.org/api";
const GOOGLE_BOOKS_BASE = "https://www.googleapis.com/books/v1/volumes";

export interface ExternalBook {
  provider: "sefaria" | "googleBooks";
  /**
   * The provider's own identifier, stored in books.external_refs. For Sefaria
   * this is the canonical index title — an identifier, never displayed.
   */
  externalId: string;
  /** The title as the provider returned it for the query. */
  title: string;
  /** Hebrew title. */
  hebrewTitle?: string;
  /** Hebrew author name. */
  author?: string;
  /** Sefaria's author topic slug — the key to the author's profile. */
  authorSlug?: string;
  /** Hebrew category labels, most general first. */
  categories?: string[];
  publishedYear?: number;
  /** Hebrew description. */
  description?: string;
  /** Hebrew place of composition. */
  compositionPlace?: string;
  coverImageUrl?: string;
  /** Sefaria era code ("RI", "AH", …) — see eraLabel() in lib/torah/hebrew. */
  era?: string;
  averagePrice?: number;
  rating?: number;
  ratingsCount?: number;
  isbn?: string;
}

/** A Sefaria author topic surfaced by search — the rabbi side of the command center. */
export interface ExternalAuthor {
  slug: string;
  /** Hebrew name as Sefaria lists it for the query. */
  name: string;
}

export interface SefariaText {
  ref: string;
  hebrewRef?: string;
  /** The Hebrew text, paragraphs flattened into lines. */
  hebrew: string[];
}

// ---------------------------------------------------------------------------
// Sefaria
// ---------------------------------------------------------------------------

export interface SefariaNameResult {
  completions?: string[];
  is_book?: boolean;
  is_ref?: boolean;
  ref?: string;
  completion_objects?: {
    title?: string;
    key?: string | string[];
    type?: string;
    is_primary?: boolean;
  }[];
}

export interface SefariaIndexResult {
  title?: string;
  heTitle?: string;
  categories?: string[];
  heCategories?: string[];
  authors?: { en?: string; he?: string; slug?: string }[];
  compDate?: number[];
  compPlaceString?: { en?: string; he?: string };
  era?: string;
  heDesc?: string;
  heShortDesc?: string;
}

interface SefariaTextResult {
  ref?: string;
  heRef?: string;
  he?: string | string[];
}

/**
 * Books and author topics from one Sefaria autocomplete response.
 *
 * The name API answers in the query's language: a Hebrew query returns Hebrew
 * `title`s with the canonical index title in `key`. The key is kept as the
 * identifier; the Hebrew title is what the user sees.
 */
export function parseSefariaNameResult(result: SefariaNameResult, limit = 8): { books: ExternalBook[]; authors: ExternalAuthor[] } {
  const books: ExternalBook[] = [];
  const authors: ExternalAuthor[] = [];
  const seenBooks = new Set<string>();

  for (const entry of result.completion_objects ?? []) {
    const title = entry.title?.trim();
    if (!title) continue;

    if (entry.type === "AuthorTopic" && typeof entry.key === "string") {
      if (!authors.some((a) => a.slug === entry.key)) {
        authors.push({ slug: entry.key, name: title });
      }
      continue;
    }

    // Only whole works: "משנה ברורה" is a book, "משנה ברורה, הקדמה" is a
    // section of one and would be a confusing thing to add to a library.
    if ((entry.type === "ref" || entry.type === "book" || entry.type === "Index") && !title.includes(",")) {
      const key = typeof entry.key === "string" ? entry.key : title;
      if (seenBooks.has(key)) continue;
      seenBooks.add(key);
      books.push({
        provider: "sefaria",
        externalId: key,
        title,
        hebrewTitle: hebrewOnly(title),
      });
    }
  }

  return { books: books.slice(0, limit), authors: authors.slice(0, 5) };
}

/** Autocomplete over Sefaria's library — books and authors in one request. */
export async function sefariaSearch(query: string, limit = 8): Promise<{ books: ExternalBook[]; authors: ExternalAuthor[] }> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return { books: [], authors: [] };

  const result = await getJson<SefariaNameResult>(
    `${SEFARIA_BASE}/name/${encodeURIComponent(trimmed)}?limit=${limit * 2}`
  );
  if (!result) return { books: [], authors: [] };
  return parseSefariaNameResult(result, limit);
}

/** Pure half of sefariaBook, exported for tests. Hebrew fields only. */
export function parseSefariaIndex(index: SefariaIndexResult): ExternalBook | null {
  if (!index.title) return null;
  const author = index.authors?.[0];
  const categories = (index.heCategories ?? []).map((c) => hebrewOnly(c)).filter((c): c is string => Boolean(c));

  return {
    provider: "sefaria",
    externalId: index.title,
    title: hebrewOnly(index.heTitle) ?? index.title,
    hebrewTitle: hebrewOnly(index.heTitle),
    author: hebrewOnly(author?.he),
    authorSlug: author?.slug || undefined,
    categories: categories.length > 0 ? categories : undefined,
    // compDate is a [start, end] range of composition years, negative for
    // BCE. The start is the useful single number for a "year" field.
    publishedYear: index.compDate?.[0],
    // heShortDesc is checked too because Sefaria sometimes fills it with
    // English — hebrewOnly is what keeps that out, not the field name.
    description: hebrewOnly(index.heDesc) ?? hebrewOnly(index.heShortDesc),
    compositionPlace: hebrewOnly(index.compPlaceString?.he),
    era: index.era?.trim() || undefined,
  };
}

/**
 * Full metadata for one Sefaria work.
 *
 * Accepts either the canonical title or a Hebrew one — Sefaria's index
 * endpoint resolves both.
 */
export async function sefariaBook(title: string): Promise<ExternalBook | null> {
  const trimmed = title.trim();
  if (!trimmed) return null;
  const index = await getJson<SefariaIndexResult>(`${SEFARIA_BASE}/v2/index/${encodeURIComponent(trimmed)}`);
  return index ? parseSefariaIndex(index) : null;
}

/**
 * Resolves a Hebrew reference as a person writes it ("משנה ברורה סימן ר״ה
 * סעיף קטן א") into Sefaria's canonical ref ("Mishnah Berurah 205:1").
 *
 * This is what makes an AI citation *verified*: Sefaria's own parser, not the
 * model, decides whether the reference exists.
 */
export async function sefariaResolveRef(hebrewRef: string): Promise<string | null> {
  const trimmed = hebrewRef.trim();
  if (trimmed.length < 3) return null;
  const result = await getJson<SefariaNameResult>(`${SEFARIA_BASE}/name/${encodeURIComponent(trimmed)}?limit=1`);
  return result?.is_ref && result.ref ? result.ref : null;
}

/**
 * A reference's canonical form and the work it belongs to — "Bava Metzia 59b"
 * in "Bava Metzia". Accepts Hebrew or English. Null when Sefaria does not
 * recognise it as a reference, which is what makes this a validation too:
 * a daf that does not exist does not resolve.
 */
export async function sefariaRefInfo(query: string): Promise<{ ref: string; index: string } | null> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return null;
  const result = await getJson<SefariaNameResult & { index?: string; book?: string }>(
    `${SEFARIA_BASE}/name/${encodeURIComponent(trimmed)}?limit=1`
  );
  if (!result?.is_ref || !result.ref) return null;
  const index = result.index ?? result.book;
  return index ? { ref: result.ref, index } : null;
}

/** Fetches the Hebrew text of a reference, for citations and the Sources Panel. */
export async function sefariaText(ref: string): Promise<SefariaText | null> {
  const result = await getJson<SefariaTextResult>(
    `${SEFARIA_BASE}/texts/${encodeURIComponent(ref)}?context=0&commentary=0`
  );
  if (!result) return null;

  return {
    ref: result.ref ?? ref,
    hebrewRef: result.heRef,
    hebrew: toLines(result.he),
  };
}

export { sefariaReadUrl } from "@/lib/torah/links";

/**
 * Sefaria returns a string for a single segment and an array for a range,
 * and either can contain HTML footnote markup.
 */
function toLines(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const lines = Array.isArray(value) ? value : [value];
  return lines
    .flat()
    .filter((line): line is string => typeof line === "string")
    .map(stripHtml)
    .filter((line) => line.length > 0);
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .trim();
}

/**
 * Empty string → undefined.
 *
 * Both providers return `""` for fields they simply do not have — Sefaria's
 * index does it for `heDesc` on most works. An empty string is "no
 * description", but it is not nullish, so it survives every `??` chain
 * downstream and wins against the real fallback. That is not theoretical: it
 * shipped, and it silently discarded the AI-generated description for every
 * sefer Sefaria had no blurb for.
 */
function nonEmpty(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

// ---------------------------------------------------------------------------
// Google Books
// ---------------------------------------------------------------------------

export interface GoogleVolume {
  id?: string;
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publishedDate?: string;
    description?: string;
    categories?: string[];
    averageRating?: number;
    ratingsCount?: number;
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    industryIdentifiers?: { type?: string; identifier?: string }[];
  };
  saleInfo?: {
    listPrice?: { amount?: number; currencyCode?: string };
    retailPrice?: { amount?: number; currencyCode?: string };
  };
}

interface GoogleVolumesResult {
  items?: GoogleVolume[];
}

/**
 * Google Books search — where cover art and price come from.
 *
 * Sefaria has neither, and Hebrew seforim are well represented here, so the
 * hub queries both and merges (see mergeExternalBooks).
 */
export async function googleBooksSearch(query: string, limit = 5): Promise<ExternalBook[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const key = process.env.GOOGLE_BOOKS_API_KEY;
  const url =
    `${GOOGLE_BOOKS_BASE}?q=${encodeURIComponent(trimmed)}` +
    `&maxResults=${limit}&printType=books` +
    // Hebrew results first — the library is Hebrew, and without this an
    // English translation of the same sefer tends to outrank the original.
    (isHebrewText(trimmed) ? "&langRestrict=he" : "") +
    (key ? `&key=${key}` : "");

  const result = await getJson<GoogleVolumesResult>(url);
  if (!result?.items) return [];

  return result.items.map(parseGoogleVolume).filter((book): book is ExternalBook => book !== null);
}

/** Pure half of googleBooksSearch, exported for tests. Hebrew text fields only. */
export function parseGoogleVolume(volume: GoogleVolume): ExternalBook | null {
  const info = volume.volumeInfo;
  if (!info?.title || !volume.id) return null;

  const price = volume.saleInfo?.retailPrice ?? volume.saleInfo?.listPrice;
  const isbn =
    info.industryIdentifiers?.find((i) => i.type === "ISBN_13")?.identifier ??
    info.industryIdentifiers?.find((i) => i.type === "ISBN_10")?.identifier;
  const categories = (info.categories ?? []).map((c) => hebrewOnly(c)).filter((c): c is string => Boolean(c));

  return {
    provider: "googleBooks",
    externalId: volume.id,
    title: info.title,
    hebrewTitle: hebrewOnly(info.title),
    author: hebrewOnly(info.authors?.[0]),
    categories: categories.length > 0 ? categories : undefined,
    // publishedDate is "2011", "2011-05" or "2011-05-04"; the year is the
    // only part that survives all three shapes.
    publishedYear: info.publishedDate ? Number.parseInt(info.publishedDate.slice(0, 4), 10) || undefined : undefined,
    description: hebrewOnly(stripHtml(info.description ?? "")),
    // Google serves these over http in some responses, which a https page
    // silently refuses to load as mixed content.
    coverImageUrl: nonEmpty((info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail)?.replace(/^http:/, "https:")),
    // Only meaningful in one currency; anything else would need a rate.
    averagePrice: price?.currencyCode === "ILS" ? price.amount : undefined,
    rating: info.averageRating,
    ratingsCount: info.ratingsCount,
    isbn,
  };
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

/**
 * Combines what each provider is actually good at.
 *
 * Sefaria is authoritative for a sefer's identity — title, author, era,
 * categories — and has no cover or price. Google Books has both and is
 * unreliable about which "משנה ברורה" you meant. So Sefaria wins on every
 * field it supplies, and Google fills the gaps rather than overriding.
 *
 * Every text field goes through hebrewOnly as well as nonEmpty: the parsers
 * above already guarantee it, and the merge re-asserting it means a future
 * provider added without that care still cannot leak English into a book.
 */
export function mergeExternalBooks(
  sefaria: ExternalBook | null,
  google: ExternalBook | null
): ExternalBook | null {
  if (!sefaria) return google;
  if (!google) return sefaria;

  const hebrewCategories = (list?: string[]) => list?.map((c) => hebrewOnly(c)).filter((c): c is string => Boolean(c));
  const sefariaCategories = hebrewCategories(sefaria.categories);
  const googleCategories = hebrewCategories(google.categories);

  return {
    ...sefaria,
    hebrewTitle: hebrewOnly(sefaria.hebrewTitle) ?? hebrewOnly(google.hebrewTitle),
    author: hebrewOnly(sefaria.author) ?? hebrewOnly(google.author),
    categories: sefariaCategories?.length ? sefariaCategories : googleCategories?.length ? googleCategories : undefined,
    publishedYear: sefaria.publishedYear ?? google.publishedYear,
    description: hebrewOnly(sefaria.description) ?? hebrewOnly(google.description),
    // Google-only fields: Sefaria has no cover, price or rating at all, so
    // there is nothing to fall back from.
    coverImageUrl: nonEmpty(google.coverImageUrl),
    averagePrice: google.averagePrice,
    rating: google.rating,
    ratingsCount: google.ratingsCount,
    isbn: google.isbn,
  };
}

export interface TorahSearchResults {
  books: ExternalBook[];
  authors: ExternalAuthor[];
}

/**
 * The one call the search command center makes: books from both providers
 * plus Sefaria's author topics, de-duplicated by title.
 *
 * Runs the providers in parallel and tolerates either failing — Promise.all
 * without the catches would make one dead provider empty the whole dropdown.
 */
export async function searchTorahSources(query: string, limit = 8): Promise<TorahSearchResults> {
  const [sefaria, googleBooks] = await Promise.all([
    sefariaSearch(query, limit).catch(() => ({ books: [] as ExternalBook[], authors: [] as ExternalAuthor[] })),
    googleBooksSearch(query, limit).catch(() => [] as ExternalBook[]),
  ]);

  const seen = new Set<string>();
  const books: ExternalBook[] = [];

  // Sefaria first, so a sefer that exists in both is presented as the
  // Sefaria record — the one with a fetchable text behind it.
  for (const book of [...sefaria.books, ...googleBooks]) {
    const key = (book.hebrewTitle ?? book.title).trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    books.push(book);
  }

  return { books: books.slice(0, limit), authors: sefaria.authors };
}

/** Books only — kept for the original /api/torah/books/search contract. */
export async function suggestBooks(query: string, limit = 8): Promise<ExternalBook[]> {
  return (await searchTorahSources(query, limit)).books;
}
