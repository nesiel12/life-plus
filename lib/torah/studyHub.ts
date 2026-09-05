import { sorted } from "@/lib/summaries/ordering";
import type { KnowledgeEntry, StudyItemKind, Summary } from "@/types";

// Aggregation for the Book and Rabbi hubs.
//
// Pure, so "what belongs to this rabbi" is testable without rendering a
// modal. The interesting question is not filtering by id — it is that an
// entity's material arrives from two directions, and both count:
//
//   1. Items filed *about* the entity (entity_type/entity_id).
//   2. Items that @mention the entity in their body.
//
// A summary of a different book that quotes הרב דניאל כהן genuinely belongs
// on his page; excluding it is exactly the "fragmented, disconnected links"
// problem this overhaul exists to remove. Both are collected, deduplicated,
// and the distinction is preserved so the UI can show *why* something is
// there rather than implying the user filed it.

export interface HubItem {
  summary: Summary;
  /** "filed" = about this entity; "mentioned" = references it in the body. */
  relation: "filed" | "mentioned";
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

function byKind(items: HubItem[], kind: StudyItemKind): HubItem[] {
  const matching = items.filter((i) => (i.summary.kind ?? "summary") === kind);
  // Ordered by the user's own arrangement, with filed items ahead of merely
  // mentioned ones at equal order — what they deliberately placed here
  // should lead.
  const ordered = sorted(matching.map((i) => ({ id: i.summary.id, sortOrder: i.summary.sortOrder ?? 0 })));
  const rank = new Map(ordered.map((o, index) => [o.id, index]));
  return [...matching].sort((a, b) => {
    if (a.relation !== b.relation) return a.relation === "filed" ? -1 : 1;
    return (rank.get(a.summary.id) ?? 0) - (rank.get(b.summary.id) ?? 0);
  });
}

export interface HubInput {
  entityType: "book" | "rabbi";
  entityId: string;
  /** The entity's display name, for matching knowledge entries. */
  entityName: string;
  summaries: Summary[];
  knowledgeEntries?: KnowledgeEntry[];
}

export function buildStudyHub({
  entityType,
  entityId,
  entityName,
  summaries,
  knowledgeEntries = [],
}: HubInput): StudyHub {
  const items = new Map<string, HubItem>();

  for (const summary of summaries) {
    if (summary.entityType === entityType && summary.entityId === entityId) {
      items.set(summary.id, { summary, relation: "filed" });
      continue;
    }
    // A filed item already recorded above wins — being filed here is the
    // stronger relationship, and an item can be both.
    const mentioned = summary.mentions?.some((m) => m.type === entityType && m.id === entityId);
    if (mentioned && !items.has(summary.id)) {
      items.set(summary.id, { summary, relation: "mentioned" });
    }
  }

  const all = [...items.values()];

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

/** Items filed under a custom section, in the user's order, filtered by kind. */
export function sectionItems(summaries: Summary[], sectionId: string, kind?: StudyItemKind): Summary[] {
  const scoped = summaries.filter(
    (s) => s.sectionId === sectionId && (kind === undefined || (s.kind ?? "summary") === kind)
  );
  const ordered = sorted(scoped.map((s) => ({ id: s.id, sortOrder: s.sortOrder ?? 0 })));
  const rank = new Map(ordered.map((o, index) => [o.id, index]));
  return [...scoped].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
}
