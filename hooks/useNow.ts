"use client";

import { useEffect, useLayoutEffect, useState } from "react";

// See hooks/useDashboardLayout.ts: useLayoutEffect warns during SSR, where it
// cannot run, so fall back to useEffect there.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * The browser's clock, as a Date that ticks.
 *
 * Null until mounted, on purpose: the server's clock and the user's are not the
 * same, and rendering a time-dependent screen from the server's would flash the
 * wrong window (or trip a hydration mismatch) before the real one arrived. The
 * value is set in a layout effect, so it lands before the first paint.
 *
 * It also re-reads on tab focus and when the tab becomes visible. Browsers
 * throttle timers in background tabs and freeze them across laptop sleep, so
 * without this a dashboard left open over lunch would still say "morning" until
 * the next tick after you looked at it.
 */
export function useNow(intervalMs = 60_000): Date | null {
  const [now, setNow] = useState<Date | null>(null);

  useIsomorphicLayoutEffect(() => {
    const tick = () => setNow(new Date());
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };

    tick();
    const timer = setInterval(tick, intervalMs);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs]);

  return now;
}
