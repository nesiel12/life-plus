export type ScrollDirection = "up" | "down";

export interface ScrollSample {
  /** window.scrollY — may be negative during iOS rubber-band overscroll. */
  y: number;
  viewportHeight: number;
  documentHeight: number;
}

export interface ScrollDirectionOptions {
  /** Movement smaller than this (px) since the last decision is ignored, so a thumb resting on the glass doesn't flicker the bar. */
  threshold: number;
  /** Within this many px of the top the answer is always "up" — the page's start always shows the nav. */
  topOffset: number;
}

export const DEFAULT_SCROLL_DIRECTION_OPTIONS: ScrollDirectionOptions = { threshold: 10, topOffset: 64 };

/**
 * One step of the auto-hiding nav's decision. Returns the direction to report
 * and the scroll position the next delta should be measured from (which only
 * moves when a decision is actually made, so slow scrolling still accumulates
 * past the threshold instead of being eaten a few pixels at a time).
 */
export function nextScrollDirection(
  previous: ScrollDirection,
  anchorY: number,
  sample: ScrollSample,
  options: ScrollDirectionOptions = DEFAULT_SCROLL_DIRECTION_OPTIONS
): { direction: ScrollDirection; anchorY: number } {
  const y = Math.max(0, sample.y);
  if (y <= options.topOffset) return { direction: "up", anchorY: y };
  // At the very bottom there's nothing left to read — and nowhere further to
  // scroll to bring the nav back — so it reappears.
  if (y + sample.viewportHeight >= sample.documentHeight - 2) return { direction: "up", anchorY: y };
  const delta = y - anchorY;
  if (Math.abs(delta) < options.threshold) return { direction: previous, anchorY };
  return { direction: delta > 0 ? "down" : "up", anchorY: y };
}
