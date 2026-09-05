import { sorted } from "@/lib/summaries/ordering";
import type { Summary, SummarySection } from "@/types";

// Section hierarchy and pinning.
//
// Pure, so the rules that matter — what counts as a top-level section, what
// a cycle would do, where pins sort — are tested without a rendered tab bar.
//
// Depth is capped at one. A sub-section cannot itself have children, and
// this module is where that is enforced, because the schema cannot express
// it without a trigger. The cap is not a fear of recursion: these sections
// render as a tab bar, and arbitrary nesting makes that a tree widget.

export interface SectionNode {
  section: SummarySection;
  children: SummarySection[];
}

/** Most-recently-pinned first, then the user's own order. */
function byPinThenOrder<T extends { id: string; sortOrder: number; pinnedAt?: string }>(items: T[]): T[] {
  const rank = new Map(
    sorted(items.map((i) => ({ id: i.id, sortOrder: i.sortOrder }))).map((o, index) => [o.id, index] as const)
  );
  return [...items].sort((a, b) => {
    if (Boolean(a.pinnedAt) !== Boolean(b.pinnedAt)) return a.pinnedAt ? -1 : 1;
    if (a.pinnedAt && b.pinnedAt && a.pinnedAt !== b.pinnedAt) {
      // Descending: the newest pin leads. A boolean flag could not express
      // this, which is why the column is a timestamp.
      return a.pinnedAt < b.pinnedAt ? 1 : -1;
    }
    return (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0);
  });
}

/**
 * Builds the two-level section tree.
 *
 * A section whose parent_id points at something that no longer exists — or
 * at another sub-section, or at itself — is treated as top level rather than
 * dropped. Losing a section from the navigation because of a bad reference
 * would hide the user's material with no way to reach it; showing it at the
 * top is wrong in a way they can see and fix.
 */
export function buildSectionTree(sections: SummarySection[]): SectionNode[] {
  const byId = new Map(sections.map((s) => [s.id, s]));

  const isTopLevel = (section: SummarySection): boolean => {
    if (!section.parentId) return true;
    if (section.parentId === section.id) return true;
    const parent = byId.get(section.parentId);
    if (!parent) return true;
    // The depth cap: a child of a child is promoted, not nested further.
    return Boolean(parent.parentId);
  };

  const roots = sections.filter(isTopLevel);
  const rootIds = new Set(roots.map((s) => s.id));

  return byPinThenOrder(roots).map((section) => ({
    section,
    children: byPinThenOrder(
      sections.filter((s) => s.parentId === section.id && !rootIds.has(s.id))
    ),
  }));
}

/**
 * Sections that may be chosen as a parent for `forSectionId`.
 *
 * Empty when the section already has children of its own: adopting a parent
 * would drag them to depth two, and silently re-parenting or orphaning
 * someone's sub-sections to permit the move would be worse than not
 * offering it.
 */
export function eligibleParents(sections: SummarySection[], forSectionId?: string): SummarySection[] {
  if (forSectionId && sections.some((s) => s.parentId === forSectionId)) return [];
  return buildSectionTree(sections)
    .map((node) => node.section)
    .filter((section) => section.id !== forSectionId);
}

/**
 * True when moving `sectionId` under `parentId` would exceed one level.
 *
 * Two ways that happens: the target is itself a child, or the section being
 * moved has children of its own and would drag them to depth two.
 */
export function wouldExceedDepth(
  sections: SummarySection[],
  sectionId: string,
  parentId: string | null
): boolean {
  if (!parentId) return false;
  if (parentId === sectionId) return true;

  const parent = sections.find((s) => s.id === parentId);
  if (!parent) return false;
  if (parent.parentId) return true;

  return sections.some((s) => s.parentId === sectionId);
}

/** Summaries in a section, pinned first, then in the user's order. */
export function orderSummaries(summaries: Summary[]): Summary[] {
  return byPinThenOrder(
    summaries.map((s) => ({ ...s, sortOrder: s.sortOrder ?? 0 }))
  );
}

/** Ids of a section and everything filed beneath it. */
export function sectionAndDescendants(sections: SummarySection[], sectionId: string): string[] {
  return [sectionId, ...sections.filter((s) => s.parentId === sectionId).map((s) => s.id)];
}
