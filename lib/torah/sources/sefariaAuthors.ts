import "server-only";

import { getJson } from "@/lib/torah/sources/http";
import { hebrewOnly, sameRabbiName } from "@/lib/torah/hebrew";
import type { LineageEntry, RabbiWork } from "@/lib/torah/rabbiProfile";
import type { SefariaNameResult } from "@/lib/torah/sources/providers";

// Sefaria's author topics — the factual backbone of a Rabbi profile.
//
// Sefaria keeps a curated record per author: Hebrew name, Hebrew biography,
// birth and death years, era, the teacher/student links it has sourced, and
// the list of that author's works in its library (with Hebrew titles and
// Hebrew descriptions). That is exactly the skeleton of the profile page, and
// every piece of it that exists is a record rather than a model's guess.
//
// HEBREW ONLY, like providers.ts: `heBio`, `he` titles, Hebrew work
// descriptions. Birth/death *places* are published in English only, so they
// are not read at all — the enrich route asks the model for them in Hebrew.

const SEFARIA_BASE = "https://www.sefaria.org/api";

export interface SefariaAuthorProfile {
  slug: string;
  hebrewName?: string;
  /** Other Hebrew names the author is known by ("חפץ חיים"). */
  hebrewAliases: string[];
  bio?: string;
  birthYear?: number;
  deathYear?: number;
  /** Sefaria era code. */
  era?: string;
  hebrewWikipediaUrl?: string;
  lineage: LineageEntry[];
  works: RabbiWork[];
}

interface TopicTitle {
  text?: string;
  lang?: string;
  primary?: boolean;
}

interface TopicLink {
  topic?: string;
  title?: { en?: string; he?: string };
  isInverse?: boolean;
}

interface PropertyValue<T> {
  value?: T;
}

export interface SefariaTopicResult {
  slug?: string;
  subclass?: string;
  primaryTitle?: { en?: string; he?: string };
  titles?: TopicTitle[];
  description?: { en?: string; he?: string };
  properties?: {
    birthYear?: PropertyValue<number>;
    deathYear?: PropertyValue<number>;
    era?: PropertyValue<string>;
    heBio?: PropertyValue<string>;
    heWikiLink?: PropertyValue<string>;
  };
  links?: Record<string, { links?: TopicLink[] }>;
  indexes?: {
    url?: string;
    title?: { en?: string; he?: string };
    description?: { en?: string | null; he?: string | null };
    compDate?: number;
    isCategory?: boolean;
  }[];
}

function finiteYear(value: unknown): number | undefined {
  const n = typeof value === "string" ? Number.parseInt(value, 10) : value;
  return typeof n === "number" && Number.isFinite(n) && n !== 0 ? n : undefined;
}

/**
 * Pure parse of a topic response into the profile skeleton.
 *
 * `taught` links are directional: isInverse=false means this author taught
 * the linked one (a student); isInverse=true means the linked one taught this
 * author (a teacher). Links with no Hebrew name are dropped rather than shown
 * in English.
 */
export function parseSefariaAuthorTopic(topic: SefariaTopicResult): SefariaAuthorProfile | null {
  if (!topic.slug) return null;

  const hebrewName = hebrewOnly(topic.primaryTitle?.he);
  const hebrewAliases = (topic.titles ?? [])
    .filter((t) => t.lang === "he" && t.text)
    .map((t) => t.text!.trim())
    .filter((text) => text && (!hebrewName || !sameRabbiName(text, hebrewName)));

  const lineage: LineageEntry[] = [];
  for (const link of topic.links?.taught?.links ?? []) {
    const name = hebrewOnly(link.title?.he);
    if (!name || !link.topic) continue;
    lineage.push({
      name,
      relation: link.isInverse ? "teacher" : "student",
      sefariaSlug: link.topic,
      origin: "import",
      confidence: 1,
    });
  }

  const works: RabbiWork[] = [];
  for (const index of topic.indexes ?? []) {
    const title = hebrewOnly(index.title?.he ?? undefined);
    if (!title) continue;
    works.push({
      title,
      description: hebrewOnly(index.description?.he ?? undefined),
      year: finiteYear(index.compDate),
      // The English title is Sefaria's identifier for the index — stored so
      // "open this book" can fetch the exact work, never shown.
      sefariaTitle: index.title?.en ?? undefined,
      origin: "import",
      confidence: 1,
    });
  }

  return {
    slug: topic.slug,
    hebrewName,
    hebrewAliases: [...new Set(hebrewAliases)],
    bio: hebrewOnly(topic.properties?.heBio?.value) ?? hebrewOnly(topic.description?.he),
    birthYear: finiteYear(topic.properties?.birthYear?.value),
    deathYear: finiteYear(topic.properties?.deathYear?.value),
    era: topic.properties?.era?.value?.trim() || undefined,
    hebrewWikipediaUrl: topic.properties?.heWikiLink?.value || undefined,
    lineage,
    works,
  };
}

/** The author topic slug for a Hebrew name, via Sefaria's autocomplete. */
export async function findSefariaAuthorSlug(name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (trimmed.length < 2) return null;

  const result = await getJson<SefariaNameResult>(`${SEFARIA_BASE}/name/${encodeURIComponent(trimmed)}?limit=10`);
  const authors = (result?.completion_objects ?? []).filter(
    (entry) => entry.type === "AuthorTopic" && typeof entry.key === "string"
  );
  if (authors.length === 0) return null;

  // Prefer an exact name match over the first autocomplete hit: "הרב קוק"
  // must not resolve to whichever Kook the ranking happens to put first when
  // one of them is named exactly what was asked for.
  const exact = authors.find((entry) => entry.title && sameRabbiName(entry.title, trimmed));
  return ((exact ?? authors[0]).key as string) ?? null;
}

/** The full author profile from Sefaria, or null when there is none. */
export async function sefariaAuthor(slug: string): Promise<SefariaAuthorProfile | null> {
  const topic = await getJson<SefariaTopicResult>(
    `${SEFARIA_BASE}/v2/topics/${encodeURIComponent(slug)}?with_links=1&annotate_links=1&with_indexes=1`
  );
  if (!topic || (topic.subclass && topic.subclass !== "author")) return null;
  return parseSefariaAuthorTopic(topic);
}
