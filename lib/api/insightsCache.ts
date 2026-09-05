// Client-side stale-while-revalidate store behind hooks/useInsights.
//
// The bug this exists for: useInsights started every mount at `data === null`
// and fetched, so navigating to the Calendar tab showed an empty screen until
// the network came back — every single time, even though the same data had
// been on screen seconds earlier. Remembering the last value across mounts
// makes a tab switch paint instantly and revalidate quietly behind it.
//
// A plain module-level Map rather than SWR or React Query: useInsights is
// already the shared fetch hook every screen uses, so the whole app benefits
// from ~60 lines here, with no new dependency, no provider to mount, and no
// second caching model living alongside the server-side ttlCache.
//
// Deliberately per-tab and in-memory only. A full reload should refetch —
// persisting to localStorage would mean showing yesterday's calendar for a
// beat on every cold start, which is worse than a spinner.

type Listener = () => void;

interface Entry {
  value: unknown;
  /** When this value was written, for the staleness check. */
  storedAt: number;
  /** Shared in-flight request, so N mounts don't fire N fetches. */
  inflight?: Promise<unknown>;
}

const store = new Map<string, Entry>();
const listeners = new Map<string, Set<Listener>>();

export function readCache<T>(key: string): { value: T; storedAt: number } | undefined {
  const entry = store.get(key);
  return entry ? { value: entry.value as T, storedAt: entry.storedAt } : undefined;
}

export function writeCache(key: string, value: unknown): void {
  const existing = store.get(key);
  store.set(key, { value, storedAt: Date.now(), inflight: existing?.inflight });
  listeners.get(key)?.forEach((notify) => notify());
}

/** Lets a mounted hook re-render when another mount refreshes the same key. */
export function subscribe(key: string, listener: Listener): () => void {
  const set = listeners.get(key) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(key, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(key);
  };
}

/**
 * Runs `fetcher` for `key`, collapsing concurrent callers onto one request.
 *
 * Two components mounting against the same endpoint in the same tick is the
 * normal case here (the dashboard renders several cards that each read the
 * calendar), and without this each would open its own connection.
 */
export function dedupedFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = store.get(key);
  if (existing?.inflight) return existing.inflight as Promise<T>;

  const inflight = fetcher()
    .then((value) => {
      writeCache(key, value);
      return value;
    })
    .finally(() => {
      const entry = store.get(key);
      // Clear only our own marker: a later request may have replaced it.
      if (entry?.inflight === inflight) {
        store.set(key, { value: entry.value, storedAt: entry.storedAt });
      }
    });

  store.set(key, {
    value: existing?.value,
    storedAt: existing?.storedAt ?? 0,
    inflight: inflight as Promise<unknown>,
  });
  return inflight;
}

/** Drops one key so the next read refetches — used after a mutation. */
export function invalidateInsights(key: string): void {
  store.delete(key);
  listeners.get(key)?.forEach((notify) => notify());
}

/** Test-only. */
export function __clearInsightsCache(): void {
  store.clear();
  listeners.clear();
}
