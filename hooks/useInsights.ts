"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";

interface UseInsightsResult<T> {
  data: T | null;
  setData: Dispatch<SetStateAction<T | null>>;
  refresh: () => void;
}

// Shared by every screen that layers AI-computed insights onto data that
// already renders instantly from the live store (Atlas Core Optimization
// v1) — previously this fetch/refresh/cancellation/state boilerplate was
// independently written in GoalsPanel, the Torah page, the Family page,
// and the Areas page. Each caller's actual response shape, fetch-failure
// fallback, and optimistic-update logic (via the returned setData) stay
// exactly as they were; only the mechanics are shared.
//
// `data` always starts `null` regardless of the route's own response
// shape — that's what lets a caller distinguish "not fetched yet" (still
// show the live store's own order/state) from "fetched, genuinely empty"
// (a real, render-worthy result). `fallback` is applied only when the
// fetch resolves with a non-ok HTTP status, matching each route's
// pre-existing behavior exactly — a network-level failure (caught below)
// leaves the previous value in place instead.
export function useInsights<T>(url: string, fallback: T, deps: unknown[] = []): UseInsightsResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const refresh = useCallback(() => setRefreshToken((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((res) => (res.ok ? res.json() : fallback))
      .then((json: T) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        // Insights are a progressive enhancement — a failed fetch just
        // leaves the previous value (or the initial null) in place, never
        // an error state for the caller.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, refreshToken, ...deps]);

  return { data, setData, refresh };
}
