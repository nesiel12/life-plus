"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Renders into <body>. Anything `position: fixed` that must cover the screen
 * (the topic canvas, floating XP) has to live here: the app's glass chrome uses
 * backdrop-filter and transforms, and either makes an ancestor the containing
 * block for fixed descendants — which is exactly how the notifications panel
 * once got clipped to a sliver. Not rendered until mounted, so it is SSR-safe.
 */
export function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? createPortal(children, document.body) : null;
}
