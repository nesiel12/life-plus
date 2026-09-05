// Ordering for sections and the summaries inside them.
//
// Pure, so drag-to-reorder correctness is testable without a DOM. The
// operations look trivial and are not: an off-by-one when moving an item
// *down* a list is the classic bug here, because removing the item first
// shifts every later index by one.

export interface Orderable {
  id: string;
  sortOrder: number;
}

/** Sparse spacing, so an insert between two rows needs no renumbering. */
export const ORDER_STEP = 100;

/** Ascending by sortOrder, with id as a stable tiebreak. */
export function sorted<T extends Orderable>(items: T[]): T[] {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

/** The sortOrder for a new item appended to the end. */
export function nextOrder(items: Orderable[]): number {
  if (items.length === 0) return ORDER_STEP;
  return Math.max(...items.map((i) => i.sortOrder)) + ORDER_STEP;
}

/**
 * Moves `id` to `toIndex` and returns only the rows whose sortOrder actually
 * changed, so the caller writes the minimum.
 *
 * Index semantics: `toIndex` is a position in the list *as the user sees it
 * before the drag*. Splicing the item out first would shift every later
 * index by one and land a downward move one slot short — so the removal and
 * the insertion are computed against the same original ordering.
 */
export function reorder<T extends Orderable>(items: T[], id: string, toIndex: number): { id: string; sortOrder: number }[] {
  const list = sorted(items);
  const fromIndex = list.findIndex((i) => i.id === id);
  if (fromIndex === -1) return [];

  // Clamp rather than throw: a drop past the end of a list is a normal
  // gesture, not an error.
  const target = Math.max(0, Math.min(toIndex, list.length - 1));
  if (target === fromIndex) return [];

  const moved = list[fromIndex];
  const without = list.filter((i) => i.id !== id);
  without.splice(target, 0, moved);

  // Renumber the whole list evenly. For lists this size (a person's sections
  // and their summaries) that is a handful of rows, and it keeps the spacing
  // uniform rather than letting gaps collapse after repeated moves. Only
  // genuinely-changed rows are returned.
  const changes: { id: string; sortOrder: number }[] = [];
  without.forEach((item, index) => {
    const nextValue = (index + 1) * ORDER_STEP;
    if (item.sortOrder !== nextValue) changes.push({ id: item.id, sortOrder: nextValue });
  });
  return changes;
}

/** Convenience for a one-step move, which is what arrow buttons produce. */
export function moveBy<T extends Orderable>(items: T[], id: string, delta: number): { id: string; sortOrder: number }[] {
  const list = sorted(items);
  const index = list.findIndex((i) => i.id === id);
  if (index === -1) return [];
  return reorder(items, id, index + delta);
}

/** True when the item is already at the top, so the UI can disable the control. */
export function isFirst<T extends Orderable>(items: T[], id: string): boolean {
  const list = sorted(items);
  return list.length > 0 && list[0].id === id;
}

export function isLast<T extends Orderable>(items: T[], id: string): boolean {
  const list = sorted(items);
  return list.length > 0 && list[list.length - 1].id === id;
}
