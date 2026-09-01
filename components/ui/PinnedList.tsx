"use client";

// Hand-built PinnedList. `@unlumen-ui/pinned-list` is a dead reference — 404
// on npm and 404 on the unlumen registry itself (same story as
// @unlumen-ui/tilt-card), so this is the equivalent behaviour written against
// framer-motion in the Luxe idiom.
//
// What it owns: ordering (pinned rows rise to the top), the travel itself
// (shared-layout spring, so a pinned row physically moves rather than
// snapping), enter/exit, and the pinned band's gold hairline ring and wash.
//
// What it deliberately doesn't own: the pin *trigger*. It hands `pinned` and
// `togglePin` to the row renderer instead of overlaying a button, because an
// absolutely-positioned control lands on top of whatever the row already has
// in its corners (TaskCard's delete button, for one). The row knows where its
// own affordances live; this component doesn't.
//
// Ordering is a stable partition: pinned items keep their relative order and
// so does everything else, so pinning one row never reshuffles its neighbours.

import { useMemo, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface PinnedRowHelpers {
  pinned: boolean;
  togglePin: () => void;
}

interface PinnedListProps<T> {
  items: T[];
  getKey: (item: T) => string;
  isPinned: (item: T) => boolean;
  onTogglePin: (item: T) => void;
  children: (item: T, helpers: PinnedRowHelpers) => ReactNode;
  className?: string;
  /** Rendered instead of the list when `items` is empty. */
  empty?: ReactNode;
}

export function PinnedList<T>({
  items,
  getKey,
  isPinned,
  onTogglePin,
  children,
  className,
  empty,
}: PinnedListProps<T>) {
  const reduce = useReducedMotion();

  const ordered = useMemo(() => {
    const pinned: T[] = [];
    const rest: T[] = [];
    for (const item of items) (isPinned(item) ? pinned : rest).push(item);
    return [...pinned, ...rest];
  }, [items, isPinned]);

  if (items.length === 0) {
    return <>{empty ?? null}</>;
  }

  return (
    <ul className={cn("flex list-none flex-col gap-3", className)}>
      <AnimatePresence initial={false}>
        {ordered.map((item) => {
          const pinned = isPinned(item);
          return (
            <motion.li
              key={getKey(item)}
              layout={reduce ? false : "position"}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
              transition={{
                layout: { type: "spring", stiffness: 420, damping: 38 },
                duration: 0.28,
                ease: "easeOut",
              }}
              className="relative min-w-0"
            >
              {/* The pinned band's gold edge — behind the row, fading in with
                  it so pinning reads as a single motion. */}
              <AnimatePresence>
                {pinned && (
                  <motion.span
                    aria-hidden
                    initial={reduce ? { opacity: 1 } : { opacity: 0, scale: 0.985 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.985 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className="pointer-events-none absolute inset-0 z-10 rounded-2xl ring-1 ring-gold-line"
                    style={{
                      background:
                        "linear-gradient(180deg, color-mix(in srgb, var(--gold) 7%, transparent), transparent 70%)",
                    }}
                  />
                )}
              </AnimatePresence>

              <div className="relative min-w-0">
                {children(item, { pinned, togglePin: () => onTogglePin(item) })}
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
