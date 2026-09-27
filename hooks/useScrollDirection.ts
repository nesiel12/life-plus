"use client";

import { useEffect, useState } from "react";
import { DEFAULT_SCROLL_DIRECTION_OPTIONS, nextScrollDirection, type ScrollDirection } from "@/lib/ui/scrollDirection";

/**
 * Which way the window last scrolled (see lib/ui/scrollDirection.ts for the
 * rules). `resetKey` — the pathname, say — puts it back to "up" whenever it
 * changes, so a new page always opens with its navigation showing.
 */
export function useScrollDirection(resetKey?: unknown): ScrollDirection {
  const [direction, setDirection] = useState<ScrollDirection>("up");

  useEffect(() => {
    setDirection("up");
    let current: ScrollDirection = "up";
    let anchorY = Math.max(0, window.scrollY);
    let frame = 0;

    const update = () => {
      frame = 0;
      const next = nextScrollDirection(
        current,
        anchorY,
        { y: window.scrollY, viewportHeight: window.innerHeight, documentHeight: document.documentElement.scrollHeight },
        DEFAULT_SCROLL_DIRECTION_OPTIONS
      );
      anchorY = next.anchorY;
      if (next.direction !== current) {
        current = next.direction;
        setDirection(current);
      }
    };
    // One decision per frame at most — scroll fires far more often than that.
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [resetKey]);

  return direction;
}
