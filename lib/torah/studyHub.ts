import { resolveEntity, type EntitySources } from "@/lib/summaries/entityRef";
import { nextOrder, sorted } from "@/lib/summaries/ordering";
import type { EntityType, KnowledgeEntry, StudyItemKind, Summary } from "@/types";

// Aggregation for the Book, Rabbi and section hubs.
//
// Pure, so "what belongs to this rabbi" is testable without rendering a
// modal. The interesting question is not filtering by id — it is that an
// entity's material arrives from two directions, and both count:
//
//   1. Items filed *about* the entity (entity_type/entity_id, or section_id).
//   2. Items that @mention the entity in their body.
//
// A summary of a different book that quotes הרב דניאל כהן genuinely belongs
// on his page; excluding it is exactly the "fragmented, disconnected links"
// problem this overhaul exists to remove. Both are collected, deduplicated,
// and the distinction is preserved so the UI can show *why* something is
// there rather than implying the user filed it.
//
// Each item also carries where it actually lives (`origin`), because a
// mentioned item shown with no context reads as if the user filed it here.
// "Mentioned · מתוך פרשת שבוע" is a link back into the ecosystem; a bare row
// is a mystery.

export interface HubItem {
  summary: Summary;
  /** "filed" = kept here; "mentioned" = references this from elsewhere. */
  relation: "filed" | "mentioned";
  /** The section or entity the item is actually filed under, when known. */
  origin?: string;
}

export interface StudyHub {
  /** Written notes, in the user's own order. */
  summaries: HubItem[];
  /** YouTube lessons. */
  videos: HubItem[];
  /** Reference texts and links. */
  sources: HubItem[];
  /** Torah knowledge entries whose topic or source names the entity. */
  relatedEntries: KnowledgeEntry[];
  /** Everything, for a count. */
  total: number;
}

/**
 * Where an item is filed, as a display string.
 *
 * Resolved through resolveEntity rather than a raw lookup so a deleted book
 * degrades to no origin at all instead of a stale name — the same
 * dangling-reference tolerance the mention layer is built on.
 */
function originOf(summary: Summary, sources?: EntitySources): string | undefined {
  if (!sources) return undefined;

  if (summary.sectionId) {
    return sources.sections.find((s) => s.id === summary.sectionId)?.name;
  }
  if (summary.entityType && summary.entityId) {
    const resolved = resolveEntity(
      { type: summary.entityType, id: summary.entityId, label: "" },
      sources
    );
    return resolved.exists ? resolved.currentLabel : undefined;
  }
  return undefined;
}

/**
 * Orders items the way the hub reads them: what the user deliberately put
 * here first, in their own arrangement, then what merely refers to it.
 */
function ordered(items: HubItem[]): HubItem[] {
  const rank = new Map(
    sorted(items.map((i) => ({ id: i.summary.id, sortOrder: i.summary.sortOrder ?? 0 }))).map(
      (o, index) => [o.id, index] as const
    )
  );
  return [...items].sort((a, b) => {
    if (a.relation !== b.relation) return a.relation === "filed" ? -1 : 1;
    return (rank.get(a.summary.id) ?? 0) - (rank.get(b.summary.id) ?? 0);
  });
}

function byKind(items: HubItem[], kind: StudyItemKind): HubItem[] {
  return ordered(items.filter((i) => (i.summary.kind ?? "summary") === kind));
}

/**
 * Collects the two directions into one deduplicated map.
 *
 * `isFiled` decides what "kept here" means — an entity id pair for a hub, a
 * section id for a section — and everything else is shared, because the
 * mention half and the ordering are identical either way.
 */
function collect(
  summaries: Summary[],
  isFiled: (summary: Summary) => boolean,
  mentionType: EntityType,
  mentionId: string,
  sources?: EntitySources
): HubItem[] {
  const items = new Map<string, HubItem>();

  for (const summary of summaries) {
    if (isFiled(summary)) {
      items.set(summary.id, { summary, relation: "filed", origin: originOf(summary, sources) });
      continue;
    }
    // A filed item already recorded above wins — being filed here is the
    // stronger relationship, and an item can be both.
    const mentioned = summary.mentions?.some((m) => m.type === mentionType && m.id === mentionId);
    if (mentioned && !items.has(summary.id)) {
      items.set(summary.id, { summary, relation: "mentioned", origin: originOf(summary, sources) });
    }
  }

  return [...items.values()];
}

export interface HubInput {
  entityType: "book" | "rabbi";
  entityId: string;
  /** The entity's display name, for matching knowledge entries. */
  entityName: string;
  summaries: Summary[];
  knowledgeEntries?: KnowledgeEntry[];
  /** Enables the `origin` label on each item. */
  sources?: EntitySources;
}

export function buildStudyHub({
  entityType,
  entityId,
  entityName,
  summaries,
  knowledgeEntries = [],
  sources,
}: HubInput): StudyHub {
  const all = collect(
    summaries,
    (s) => s.entityType === entityType && s.entityId === entityId,
    entityType,
    entityId,
    sources
  );

  // Knowledge entries have no entity link, so this is a name match — kept
  // deliberately strict (whole-name containment, case-insensitive) because a
  // loose match on a short rabbi name would pull in unrelated entries.
  const needle = entityName.trim().toLowerCase();
  const relatedEntries =
    needle.length >= 2
      ? knowledgeEntries.filter(
          (e) =>
            e.topic.toLowerCase().includes(needle) ||
            (e.source ?? "").toLowerCase().includes(needle)
        )
      : [];

  return {
    summaries: byKind(all, "summary"),
    videos: byKind(all, "video"),
    sources: byKind(all, "source"),
    relatedEntries,
    total: all.length + relatedEntries.length,
  };
}

/** Where a new item is filed. Exactly one of the two applies. */
export interface FilingTarget {
  sectionId?: string;
  entityType?: Summary["entityType"];
  entityId?: string;
}

/**
 * The sort order a newly created item should get.
 *
 * Ordered against the items it will actually sit beside — the ones *filed*
 * in the same place — so it lands at the end of its own list rather than of
 * everything. Mentioned items are excluded on purpose: they live elsewhere,
 * their sort orders belong to another list, and ranking a new note against
 * them would drop it into an arbitrary position.
 *
 * Shared by every creation path. Without it the rich editor inserted with no
 * order at all, which defaulted to 0 and silently sent each new summary to
 * the top while quick-added videos went to the bottom.
 */
export function nextSortOrder(summaries: Summary[], target: FilingTarget): number {
  const siblings = summaries.filter((s) =>
    target.sectionId
      ? s.sectionId === target.sectionId
      : s.entityType === target.entityType && s.entityId === target.entityId
  );
  return nextOrder(siblings.map((s) => ({ id: s.id, sortOrder: s.sortOrder ?? 0 })));
}

export interface SectionHubInput {
  sectionId: string;
  summaries: Summary[];
  /** Enables the `origin` label on mentioned items. */
  sources?: EntitySources;
}

/**
 * A custom section's contents: what is filed in it, plus what @mentions it.
 *
 * The second half is what makes a section a first-class citizen of the
 * ecosystem rather than a folder. Someone writing on a rabbi's page who types
 * "@הלכות שבת" has drawn a line to that section; the section showing nothing
 * would make the link one-way, which is the disconnection this fixes.
 *
 * One mixed stream rather than kind buckets, because a section is read top to
 * bottom — the note, the shiur and the source for one chapter sit together.
 */
export function buildSectionHub({ sectionId, summaries, sources }: SectionHubInput): HubItem[] {
  return ordered(collect(summaries, (s) => s.sectionId === sectionId, "section", sectionId, sources));
}
