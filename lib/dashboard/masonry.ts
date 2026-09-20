// The arithmetic behind the dashboard's masonry grid.
//
// A CSS grid sizes every row to its tallest cell, so cards of different heights
// leave empty bands beneath the short ones. Masonry avoids that by giving the
// grid a very fine row unit and letting each card claim exactly as many rows as
// it is tall; `grid-auto-flow: dense` then packs the next card into the
// earliest free slot. All the browser needs from us is one number per card.

/** Height of one grid row, in px. Small enough that rounding up wastes little. */
export const MASONRY_ROW_UNIT = 8;

/**
 * How many rows a card of `heightPx` must span.
 *
 * Rounded UP: rounding down would let a card run over the one beneath it, and
 * an overlap is a far worse fault than up to (unit - 1)px of extra space. Any
 * height that is not a positive finite number claims a single row — a card that
 * has not been measured yet must not collapse to zero or take the whole page.
 */
export function masonrySpan(heightPx: number, unit: number = MASONRY_ROW_UNIT): number {
  if (!Number.isFinite(heightPx) || heightPx <= 0 || !Number.isFinite(unit) || unit <= 0) return 1;
  return Math.max(1, Math.ceil(heightPx / unit));
}
