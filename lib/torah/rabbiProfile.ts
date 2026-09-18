// The Rabbi profile, as pure data — merging, matching and the link helpers
// behind the "investigation loop" (Book → Rabbi → Rabbi's other books → …).
//
// No database, no React, no network: the enrichment route and the profile
// page both lean on these, and the questions they answer ("is this teacher
// already in my library?", "does Sefaria's entry replace the model's guess?")
// are exactly the ones worth pinning with tests (rabbiProfile.test.ts).

import { bookTitleKey, rabbiNameKey } from "@/lib/torah/hebrew";

/**
 * Who asserted a profile fact.
 *
 * Mirrors kg_edges.origin: `import` came from Sefaria's records, `ai` is a
 * model's inference, `user` was typed by the user. The profile renders them
 * differently, and the merge rules below never let a guess overwrite a record.
 */
export type ProfileOrigin = "import" | "ai" | "user";

export interface LineageEntry {
  /** Hebrew name as displayed. */
  name: string;
  relation: "teacher" | "student";
  sefariaSlug?: string;
  origin: ProfileOrigin;
  /** 0..1 — 1 for a Sefaria record or a user entry. */
  confidence: number;
}

export interface RabbiWork {
  /** Hebrew title. */
  title: string;
  /** Hebrew description — never a translated one. */
  description?: string;
  year?: number;
  /** Sefaria's canonical title, used only as an identifier for lookups. */
  sefariaTitle?: string;
  origin: ProfileOrigin;
  confidence: number;
}

export interface SuggestedLink {
  kind: "website" | "youtube";
  url: string;
  label?: string;
  confidence: number;
}

export interface RabbiLocation {
  place: string;
  fromYear?: number;
  toYear?: number;
  note?: string;
}

const ORIGIN_RANK: Record<ProfileOrigin, number> = { user: 3, import: 2, ai: 1 };

function better<T extends { origin: ProfileOrigin; confidence: number }>(a: T, b: T): T {
  if (ORIGIN_RANK[a.origin] !== ORIGIN_RANK[b.origin]) {
    return ORIGIN_RANK[a.origin] > ORIGIN_RANK[b.origin] ? a : b;
  }
  return b.confidence > a.confidence ? b : a;
}

/**
 * Merges a fresh batch of teachers/students into what is stored.
 *
 * Re-enrichment must converge, not stack: the same teacher from Sefaria twice
 * is one entry. When the model and Sefaria name the same person, the record
 * wins — and an entry the user added by hand is never displaced by either.
 */
export function mergeLineage(existing: LineageEntry[], incoming: LineageEntry[]): LineageEntry[] {
  const byKey = new Map<string, LineageEntry>();
  const keyOf = (entry: LineageEntry) => `${entry.relation}:${rabbiNameKey(entry.name)}`;
  const slugIndex = new Map<string, string>();

  for (const entry of [...existing, ...incoming]) {
    if (!entry.name?.trim()) continue;
    const slugKey = entry.sefariaSlug ? slugIndex.get(`${entry.relation}:${entry.sefariaSlug}`) : undefined;
    const key = slugKey ?? keyOf(entry);
    const current = byKey.get(key);
    const merged = current ? better(current, entry) : entry;
    // Keep a slug learned from either side — it is what makes the entry
    // resolvable against Sefaria later, whoever "won" the display name.
    const withSlug = { ...merged, sefariaSlug: merged.sefariaSlug ?? current?.sefariaSlug ?? entry.sefariaSlug };
    byKey.set(key, withSlug);
    if (withSlug.sefariaSlug) slugIndex.set(`${entry.relation}:${withSlug.sefariaSlug}`, key);
  }

  return [...byKey.values()];
}

/** Same convergence rules as mergeLineage, keyed by title. */
export function mergeWorks(existing: RabbiWork[], incoming: RabbiWork[]): RabbiWork[] {
  const byKey = new Map<string, RabbiWork>();
  for (const work of [...existing, ...incoming]) {
    if (!work.title?.trim()) continue;
    const key = bookTitleKey(work.title);
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, work);
      continue;
    }
    const winner = better(current, work);
    const loser = winner === current ? work : current;
    // Fill the winner's gaps from the loser rather than dropping them: a
    // Sefaria record with no description plus a model's description of the
    // same sefer should show both facts.
    byKey.set(key, {
      ...winner,
      description: winner.description ?? loser.description,
      year: winner.year ?? loser.year,
      sefariaTitle: winner.sefariaTitle ?? loser.sefariaTitle,
    });
  }
  return [...byKey.values()].sort((a, b) => (a.year ?? Infinity) - (b.year ?? Infinity));
}

interface BookLike {
  id: string;
  title: string;
  hebrewTitle?: string;
  externalRefs?: Record<string, unknown>;
}

function sefariaIdOf(refs: Record<string, unknown> | undefined): string | undefined {
  const sefaria = refs?.sefaria as { id?: unknown } | undefined;
  return typeof sefaria?.id === "string" ? sefaria.id : undefined;
}

/** The library row for a work, if the user already has it. */
export function findLibraryBook<T extends BookLike>(
  work: { title: string; sefariaTitle?: string },
  books: T[]
): T | undefined {
  const key = bookTitleKey(work.title);
  return books.find(
    (book) =>
      (work.sefariaTitle && sefariaIdOf(book.externalRefs) === work.sefariaTitle) ||
      bookTitleKey(book.title) === key ||
      (book.hebrewTitle !== undefined && bookTitleKey(book.hebrewTitle) === key)
  );
}

interface RabbiLike {
  id: string;
  name: string;
  hebrewName?: string;
  externalRefs?: Record<string, unknown>;
}

function sefariaSlugOf(refs: Record<string, unknown> | undefined): string | undefined {
  const sefaria = refs?.sefaria as { slug?: unknown } | undefined;
  return typeof sefaria?.slug === "string" ? sefaria.slug : undefined;
}

/**
 * The library row for a rabbi, by Sefaria slug first and folded name second.
 *
 * Slug first because names are ambiguous in exactly the way that matters
 * here — "רבי ישראל מאיר הכהן" and "החפץ חיים" are one person — while a slug
 * is an identity.
 */
export function findLibraryRabbi<T extends RabbiLike>(
  query: { name: string; sefariaSlug?: string },
  rabbis: T[]
): T | undefined {
  if (query.sefariaSlug) {
    const bySlug = rabbis.find((r) => sefariaSlugOf(r.externalRefs) === query.sefariaSlug);
    if (bySlug) return bySlug;
  }
  const key = rabbiNameKey(query.name);
  if (!key) return undefined;
  return rabbis.find(
    (r) => rabbiNameKey(r.name) === key || (r.hebrewName !== undefined && rabbiNameKey(r.hebrewName) === key)
  );
}

/**
 * YouTube searches worth offering for a rabbi or a book.
 *
 * Search terms, not video ids: a model asked for real videos invents ids that
 * 404 (see lib/learning/youtube.ts). A query is honest — "here is where to
 * look" — and is exactly what the API search runs when a key is configured.
 */
export function mediaSearchQueries(input: { name: string; works?: { title: string }[]; kind: "rabbi" | "book" }): string[] {
  const name = input.name.trim();
  if (!name) return [];
  if (input.kind === "book") {
    return [`שיעור ${name}`, `${name} שיעורים`, `לימוד ${name}`];
  }
  const queries = [`${name} שיעור`, `${name} הרצאה`];
  for (const work of (input.works ?? []).slice(0, 3)) queries.push(`${name} ${work.title}`);
  return [...new Set(queries)];
}

// ---------------------------------------------------------------------------
// Contact links
// ---------------------------------------------------------------------------

/** An http(s) URL, normalised, or null. Anything else never becomes an href. */
export function safeHttpUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Digits of a phone number in international form for wa.me/tel, Israeli 0-prefix assumed. */
export function internationalPhone(value: string | null | undefined): string | null {
  const digits = value?.replace(/[^\d+]/g, "") ?? "";
  if (!digits) return null;
  if (digits.startsWith("+")) return digits.slice(1).length >= 8 ? digits.slice(1) : null;
  if (digits.startsWith("00")) return digits.length >= 10 ? digits.slice(2) : null;
  if (digits.startsWith("0")) return digits.length >= 9 ? `972${digits.slice(1)}` : null;
  return digits.length >= 8 ? digits : null;
}

export function telHref(phone: string | null | undefined): string | null {
  const international = internationalPhone(phone);
  return international ? `tel:+${international}` : null;
}

/**
 * A WhatsApp link from what the user typed: a group invite URL stays as it
 * is (only if it really is WhatsApp's host), a phone number becomes wa.me.
 */
export function whatsappHref(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (/[a-z]/i.test(trimmed)) {
    const url = safeHttpUrl(trimmed);
    if (!url) return null;
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host === "chat.whatsapp.com" || host === "wa.me" || host === "whatsapp.com" ? url : null;
  }
  const international = internationalPhone(trimmed);
  return international ? `https://wa.me/${international}` : null;
}

/** Only youtube.com / youtu.be channel URLs are accepted as a channel. */
export function youtubeChannelHref(value: string | null | undefined): string | null {
  const url = safeHttpUrl(value);
  if (!url) return null;
  const host = new URL(url).hostname.replace(/^(www\.|m\.)/, "");
  return host === "youtube.com" ? url : null;
}

/** A display label for a URL: the host without www. */
export function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Initials for a portrait placeholder — the identifying words, not "הרב". */
export function rabbiInitials(name: string): string {
  const key = rabbiNameKey(name);
  const words = key.split(" ").filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2);
  return `${words[0][0]}${words[words.length - 1][0]}`;
}
