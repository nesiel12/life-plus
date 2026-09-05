"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { dedupedFetch, invalidateInsights, readCache, subscribe, writeCache } from "@/lib/api/insightsCache";

interface UseInsightsResult<T> {
  data: T | null;
  setData: Dispatch<SetStateAction<T | null>>;
  refresh: () => void;
  /** True while a request is in flight and there is nothing cached to show. */
  loading: boolean;
}

// Shared by every screen that layers AI-computed insights onto data that
// already renders instantly from the live store (Atlas Core Optimization
// v1) — previously this fetch/refresh/cancellation/state boilerplate was
// independently written in GoalsPanel, the Torah page, the Family page,
// and the Areas page. Each caller's actual response shape, fetch-failure
// fallback, and optimistic-update logic (via the returned setData) stay
// exactly as they were; only the mechanics are shared.
//
// Stale-while-revalidate (lib/api/insightsCache.ts): a remount now paints
// immediately from the last known value for that URL and revalidates in the
// background, instead of dropping to null and showing an empty screen until
// the network returns. That is what made switching to the Calendar tab feel
// slow every single time even when nothing had changed.
//
// `data` still starts null on a genuinely cold key, which is what lets a
// caller distinguish "not fetched yet" (show the live store's own state)
// from "fetched, genuinely empty". `fallback` is applied only on a non-ok
// HTTP status, matching each route's pre-existing behavior exactly — a
// network-level failure leaves the previous value in place instead.
export function useInsights<T>(url: string, fallback: T, deps: unknown[] = []): UseInsightsResult<T> {
  const cached = readCache<T>(url);
  const [data, setData] = useState<T | null>(cached ? cached.value : null);
  const [loading, setLoading] = useState(!cached);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => {
    invalidateInsights(url);
    setRefreshToken((t) => t + 1);
  }, [url]);

  // Re-render when another mount of the same URL refreshes it, so two cards
  // reading one endpoint can't display different values.
  useEffect(() => {
    return subscribe(url, () => {
      const next = readCache<T>(url);
      if (next) setData(next.value);
    });
  }, [url]);

  useEffect(() => {
    let cancelled = false;

    // Paint whatever is already known for this key before the request
    // resolves — this is the whole point of the cache.
    const known = readCache<T>(url);
    if (known) {
      setData(known.value);
      setLoading(false);
    } else {
      setLoading(true);
    }

    dedupedFetch<T>(url, () =>
      fetch(url)
        .then((res) => (res.ok ? (res.json() as Promise<T>) : Promise.resolve(fallback)))
    )
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        // Insights are a progressive enhancement — a failed fetch just
        // leaves the previous value (or the initial null) in place, never
        // an error state for the caller.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, refreshToken, ...deps]);

  // Keep an optimistic local update visible to other mounts of the same key,
  // rather than letting them overwrite it with the older cached value.
  const setDataAndCache = useCallback<Dispatch<SetStateAction<T | null>>>(
    (update) => {
      setData((prev) => {
        const next = typeof update === "function" ? (update as (p: T | null) => T | null)(prev) : update;
        if (next !== null) writeCache(url, next);
        return next;
      });
    },
    [url]
  );

  return { data, setData: setDataAndCache, refresh, loading };
}
