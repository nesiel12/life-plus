"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, type Variants } from "framer-motion";
import { MASONRY_ROW_UNIT, masonrySpan } from "@/lib/dashboard/masonry";
import { cn } from "@/lib/utils";

// See hooks/useDashboardLayout.ts: useLayoutEffect warns during SSR.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

// The same entrance stagger the bento grid had (components/magicui/bento-grid.tsx),
// so cards still arrive one after another. BentoCard's own variants pick it up.
const GRID_VARIANTS: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.075, delayChildren: 0.12 } },
};

interface MasonryContextValue {
  /** True once the grid has switched to fine rows and cards report their height. */
  active: boolean;
}

const MasonryContext = createContext<MasonryContextValue>({ active: false });

/**
 * The dashboard's widget grid, without the empty bands.
 *
 * A plain CSS grid stretches every card in a row to the tallest one, leaving
 * blank space inside the shorter cards. This grid instead uses 8px rows and each
 * card (via useMasonryItem) claims as many as its own height needs, with
 * `grid-auto-flow: dense` packing the next card into the earliest free slot.
 *
 * Why not CSS `columns`: a widget can span two or three of the columns
 * (lib/dashboard/layout.ts spans), and multi-column layout has no partial
 * spans — adopting it would silently break every saved width. A grid keeps
 * spans, DOM order, drag-and-drop and the edit chrome exactly as they were.
 *
 * Until the client has switched it on, the grid is an ordinary auto-row grid
 * (with cards top-aligned so they measure at their natural height), so the
 * server-rendered page never shows cards piled on top of each other.
 */
export function MasonryGrid({ children, className }: { children: ReactNode; className?: string }) {
  const [active, setActive] = useState(false);

  useIsomorphicLayoutEffect(() => {
    // `dense` is what makes cards fill earlier gaps; without it the technique
    // would leave the very holes it exists to remove, so an engine that lacks
    // it keeps the plain grid.
    setActive(typeof CSS !== "undefined" && CSS.supports("grid-auto-flow", "row dense"));
  }, []);

  const value = useMemo(() => ({ active }), [active]);

  return (
    <MasonryContext.Provider value={value}>
      <motion.div
        variants={GRID_VARIANTS}
        initial="hidden"
        animate="show"
        data-masonry={active ? "on" : "off"}
        style={active ? { gridAutoRows: `${MASONRY_ROW_UNIT}px` } : undefined}
        className={cn(
          "grid w-full grid-cols-1 items-start gap-x-5 sm:grid-cols-2 sm:gap-x-6 lg:grid-cols-3 lg:gap-x-7",
          active ? "grid-flow-row-dense" : "gap-y-5 sm:gap-y-6 lg:gap-y-7",
          className
        )}
      >
        {children}
      </motion.div>
    </MasonryContext.Provider>
  );
}

/**
 * Makes one grid cell report its height to the grid.
 *
 * Spread the result onto the cell: `ref` and `style` are required, `className`
 * adds the bottom padding that stands in for the row gap (the grid has none
 * between rows in masonry mode — the gap has to live inside the cell, or the
 * cell's measured height would leave cards touching).
 *
 * The cell must be top-aligned (the grid's items-start) so its own height is its
 * content's and not the row it happens to sit in — otherwise measuring would
 * feed the grid its own output.
 */
export function useMasonryItem() {
  const { active } = useContext(MasonryContext);
  const ref = useRef<HTMLDivElement>(null);
  const [span, setSpan] = useState(1);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el || !active) return;

    const measure = () => setSpan(masonrySpan(el.offsetHeight));
    measure();

    // ResizeObserver is the primary signal: it catches a card growing when its
    // data arrives, a font loading, or the column count changing at a breakpoint.
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(el);

    // Its delivery is tied to rendering, which a background tab defers. Content
    // arriving while the tab is hidden would then leave a stale span, and cards
    // would overlap when it came back. A mutation observer is not deferred, so
    // it covers that case. Attributes are deliberately not watched: animations
    // rewrite styles every frame and would make this measure constantly.
    let pending = false;
    const schedule = () => {
      if (pending) return;
      pending = true;
      queueMicrotask(() => {
        pending = false;
        measure();
      });
    };
    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(el, { childList: true, subtree: true, characterData: true });

    // A viewport change moves the grid between one, two and three columns, which
    // rewraps every card. Same reason as above: the window's resize event is
    // delivered even when the observers' rendering-tied callbacks are not.
    window.addEventListener("resize", schedule);

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [active]);

  return {
    ref,
    active,
    style: active ? { gridRowEnd: `span ${span}` } : undefined,
    className: active ? "pb-5 sm:pb-6 lg:pb-7" : "",
  };
}
