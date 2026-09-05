"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  DEFAULT_LAYOUT,
  cycleSpan,
  moveWidget,
  moveWidgetTo,
  normalizeLayout,
  setHidden,
  type DashboardLayout,
} from "@/lib/dashboard/layout";

const STORAGE_KEY = "lifeplus.dashboard.layout";

// useLayoutEffect warns when React renders on the server, where it cannot
// run. Falling back to useEffect there keeps the warning away without
// giving up the pre-paint timing on the client, which is the entire point
// (see below).
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function read(): DashboardLayout {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    return normalizeLayout(JSON.parse(raw));
  } catch {
    // Private mode, blocked site data, or a half-written value. A layout
    // preference is not worth an error boundary — the default dashboard is a
    // perfectly good dashboard.
    return DEFAULT_LAYOUT;
  }
}

function write(layout: DashboardLayout): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Quota or blocked storage. The arrangement still applies for this
    // session; only its persistence is lost, and telling the user their
    // dashboard failed to save every time they nudge a card would be worse
    // than the silence.
  }
}

/**
 * The user's dashboard arrangement, persisted per device.
 *
 * Stored in localStorage rather than the database, deliberately. The layout
 * is a property of the screen you are looking at, not of the account: a
 * three-column arrangement carefully built on a desktop is the wrong one on
 * a phone, and syncing it would push each device's arrangement onto the
 * others. The honest cost is that it does not follow you to a new browser,
 * which is the same trade the theme preference already makes.
 *
 * The stored value is applied in a layout effect, not a plain effect. Both
 * run after the first render — the server has no localStorage, so the first
 * paint must be the default order either way — but a layout effect runs
 * *before the browser paints*, so the reorder is never visible. With
 * useEffect the user sees the default dashboard for a frame and then watches
 * their own arrangement snap into place on every single load.
 */
export function useDashboardLayout() {
  const [layout, setLayout] = useState<DashboardLayout>(DEFAULT_LAYOUT);
  const [hydrated, setHydrated] = useState(false);

  useIsomorphicLayoutEffect(() => {
    setLayout(read());
    setHydrated(true);
  }, []);

  // Persist only after the stored value has been read. Without this guard
  // the first render's DEFAULT_LAYOUT would be written straight over the
  // user's saved arrangement before it was ever loaded.
  useEffect(() => {
    if (hydrated) write(layout);
  }, [layout, hydrated]);

  const move = useCallback((id: string, delta: number) => {
    setLayout((current) => moveWidget(current, id, delta));
  }, []);

  const moveTo = useCallback((id: string, targetId: string) => {
    setLayout((current) => moveWidgetTo(current, id, targetId));
  }, []);

  const hide = useCallback((id: string) => {
    setLayout((current) => setHidden(current, id, true));
  }, []);

  const restore = useCallback((id: string) => {
    setLayout((current) => setHidden(current, id, false));
  }, []);

  const resize = useCallback((id: string) => {
    setLayout((current) => cycleSpan(current, id));
  }, []);

  const reset = useCallback(() => setLayout(DEFAULT_LAYOUT), []);

  return { layout, hydrated, move, moveTo, hide, restore, resize, reset };
}
