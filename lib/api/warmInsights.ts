"use client";

// Every screen's own data (topics, tasks, people, transactions, ...) is
// already in the Zustand store from the one bootstrap call — switching tabs
// never waits on that. What each screen still fetches for itself is the
// AI-computed insight layered on top (lib/api/insightsCache.ts's
// useInsights): the streak read on the calendar, the energy badge, the
// day's Torah recap. Those are real per-screen requests, invisible until
// the tab is actually opened — which is what made a first visit to any tab
// show a spinner even though the underlying data had been sitting in the
// store the whole time.
//
// Only the parameter-free ones are listed: a calendar month/day/week view
// depends on which month/day/week is open, so guessing which one to warm
// would be as likely to waste a request as to save one. These six are the
// same URL on every visit, which is exactly what makes prefetching them
// safe — there's only one right answer to warm.
import { dedupedFetch, readCache } from "@/lib/api/insightsCache";

export const STATIC_INSIGHT_URLS = [
  "/api/areas/insights",
  "/api/calendar/upcoming",
  "/api/calendar/week",
  "/api/family/insights",
  "/api/torah/insights",
  "/api/goals/insights",
  "/api/today/energy",
  "/api/hebrew-calendar",
  "/api/photos/memories",
] as const;

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

/**
 * Fires all of them through the same dedupedFetch + cache that useInsights
 * itself reads — so by the time a screen mounts and calls useInsights, the
 * value is very likely already sitting in the cache (readCache) instead of
 * `null`, and the request that would otherwise have started on mount is
 * already in flight or finished. A screen visited before this resolves still
 * gets the same one shared request via dedupedFetch's own de-duplication,
 * not a second one.
 */
export function warmInsightsCache(): void {
  for (const url of STATIC_INSIGHT_URLS) {
    // dedupedFetch only collapses *concurrent* callers onto one request —
    // it has no notion of "already have a value, skip" (useInsights itself
    // never needs that: it only ever calls dedupedFetch once, on mount).
    // Without this check, warming a URL the current page's own widgets
    // already fetch (the calendar week card on the home page, say) fired a
    // second, wholly redundant request every single time — live-caught: the
    // network log showed /api/calendar/week and /api/hebrew-calendar twice
    // on first load.
    if (readCache(url)) continue;
    void dedupedFetch(url, () => fetchJson(url)).catch(() => {
      // Best-effort warm-up: a failure here just means the screen's own
      // useInsights call fetches for real when it mounts, exactly as before
      // this existed. Never surface a warm-up failure to the user.
    });
  }
}
