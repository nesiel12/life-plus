import type { Book, Person, Rabbi } from "@/types";

// The entity layer behind summaries and @mentions.
//
// Pure and separately testable: resolution, search ranking and mention
// extraction all happen here, so none of it depends on a mounted editor.
//
// The central constraint comes from the schema (see the migration): entity
// references are a (type, id) pair with no foreign key, because books,
// rabbis, people and topics live in different tables and "topic" has none at
// all. That buys flexibility and costs referential integrity, so everything
// here is written to tolerate a dangling reference — a deleted book must
// degrade to plain text, never to a broken link or a crash.

export type EntityType = "book" | "rabbi" | "person" | "topic";

export interface EntityRef {
  type: EntityType;
  id: string;
  /** Snapshot of the name at insert time — see resolveEntity. */
  label: string;
}

export interface ResolvedEntity extends EntityRef {
  /** The entity's current name, which may differ from the stored label. */
  currentLabel: string;
  /** False when the underlying record no longer exists. */
  exists: boolean;
  /** Where this entity lives, when it has a page. */
  href: string | null;
}

export interface EntitySources {
  books: Book[];
  rabbis: Rabbi[];
  people: Person[];
  /** Free-form topics have no table; they exist only as labels. */
  topics?: string[];
}

const HREF: Record<EntityType, string | null> = {
  book: "/areas/torah",
  rabbi: "/areas/torah",
  person: "/areas/family",
  // A topic is a label, not a record, so there is nowhere to navigate to.
  topic: null,
};

export const ENTITY_LABELS: Record<EntityType, string> = {
  book: "ספר",
  rabbi: "רב",
  person: "איש קשר",
  topic: "נושא",
};

function nameOf(sources: EntitySources, type: EntityType, id: string): string | null {
  switch (type) {
    case "book":
      return sources.books.find((b) => b.id === id)?.title ?? null;
    case "rabbi":
      return sources.rabbis.find((r) => r.id === id)?.name ?? null;
    case "person": {
      const person = sources.people.find((p) => p.id === id);
      return person ? (person.hebrewName ?? person.name) : null;
    }
    case "topic":
      // A topic's id *is* its label; it always resolves to itself.
      return id;
  }
}

/**
 * Resolves a stored reference against current data.
 *
 * The stored `label` is a snapshot from when the mention was inserted. It is
 * kept rather than discarded so a summary written about "עט הלב" still reads
 * correctly if the book is later renamed or deleted — the prose keeps the
 * words the author actually wrote. `currentLabel` is what to display when the
 * entity still exists, so a rename propagates to live links.
 */
export function resolveEntity(ref: EntityRef, sources: EntitySources): ResolvedEntity {
  const current = nameOf(sources, ref.type, ref.id);
  return {
    ...ref,
    currentLabel: current ?? ref.label,
    exists: current !== null,
    href: current !== null ? HREF[ref.type] : null,
  };
}

export function resolveEntities(refs: EntityRef[], sources: EntitySources): ResolvedEntity[] {
  return refs.map((ref) => resolveEntity(ref, sources));
}

export interface EntityCandidate {
  type: EntityType;
  id: string;
  label: string;
  /** Secondary line in the picker — an author, a rabbi's title, a relation. */
  detail?: string;
}

/** Everything mentionable, flattened into one list. */
export function allCandidates(sources: EntitySources): EntityCandidate[] {
  return [
    ...sources.books.map((b) => ({ type: "book" as const, id: b.id, label: b.title, detail: b.author })),
    ...sources.rabbis.map((r) => ({ type: "rabbi" as const, id: r.id, label: r.name, detail: r.title })),
    ...sources.people.map((p) => ({
      type: "person" as const,
      id: p.id,
      label: p.hebrewName ?? p.name,
      detail: p.relation,
    })),
    ...(sources.topics ?? []).map((t) => ({ type: "topic" as const, id: t, label: t })),
  ];
}

const MAX_SUGGESTIONS = 8;

/**
 * Ranks candidates for the @mention picker.
 *
 * Prefix matches rank above substring matches, because someone typing "@דנ"
 * almost always means a name starting with those letters, and burying it
 * under a mid-word match makes the picker feel wrong. An empty query returns
 * the head of the list rather than nothing, so typing "@" alone still shows
 * something to pick.
 */
export function searchEntities(query: string, sources: EntitySources, limit = MAX_SUGGESTIONS): EntityCandidate[] {
  const candidates = allCandidates(sources);
  const q = query.trim().toLowerCase();
  if (!q) return candidates.slice(0, limit);

  const scored: { candidate: EntityCandidate; score: number }[] = [];
  for (const candidate of candidates) {
    const label = candidate.label.toLowerCase();
    if (label.startsWith(q)) scored.push({ candidate, score: 0 });
    else if (label.includes(q)) scored.push({ candidate, score: 1 });
    else if (candidate.detail?.toLowerCase().includes(q)) scored.push({ candidate, score: 2 });
  }

  return scored
    .sort((a, b) => a.score - b.score || a.candidate.label.localeCompare(b.candidate.label, "he"))
    .slice(0, limit)
    .map((s) => s.candidate);
}

/**
 * Pulls every mention out of the editor's HTML.
 *
 * Reads the data attributes TipTap's Mention extension writes, rather than
 * matching "@word" in the text: a literal "@" someone typed in prose is not
 * a mention, and a mention whose label contains a space would break any
 * text-based pattern.
 */
export function extractMentions(html: string): EntityRef[] {
  const found: EntityRef[] = [];
  const seen = new Set<string>();
  const pattern = /<span[^>]*data-entity-type="([^"]+)"[^>]*data-entity-id="([^"]+)"[^>]*data-label="([^"]*)"[^>]*>/g;

  for (const match of html.matchAll(pattern)) {
    const [, type, id, label] = match;
    if (!isEntityType(type)) continue;
    const key = `${type}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ type, id, label: decodeAttr(label) });
  }
  return found;
}

function isEntityType(value: string): value is EntityType {
  return value === "book" || value === "rabbi" || value === "person" || value === "topic";
}

/** HTML attribute values arrive escaped; mention labels are user text. */
function decodeAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
