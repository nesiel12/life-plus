// A tiny per-process TTL cache, same shape and same honest limitation as
// lib/api/rateLimit.ts's bucket map: correct and sufficient for a single
// instance; once this runs on more than one, each instance keeps its own
// copy (which for a short-lived read cache is a staleness ceiling, not a
// correctness bug — unlike the rate limiter, where it weakens the limit).
//
// Why this exists: the calendar routes hit the Google API on every mount,
// so navigating between the dashboard, the Smart Calendar and Time & Tasks
// paid a fresh network round trip each time even though a week's events
// don't meaningfully change second to second. Caching the *fetch* rather
// than the response keeps every route's auth, rate limiting and shaping
// exactly as it was — only the upstream call is skipped.

interface Entry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, Entry<unknown>>();

// Bounds the map so a long-lived process can't accumulate entries for keys
// that are never requested again (a per-user key grows with the user count).
const MAX_ENTRIES = 500;

function evictExpired(now: number): void {
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
}

/**
 * Returns the cached value for `key`, or runs `fetcher` and caches it.
 *
 * A rejected `fetcher` is never cached — a transient Google failure must not
 * pin an error (or an empty result) in front of the user for the whole TTL.
 */
export async function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) return hit.value as T;

  const value = await fetcher();

  if (store.size >= MAX_ENTRIES) {
    evictExpired(now);
    // Still full of live entries — drop the oldest-inserted key. Map
    // preserves insertion order, so this is a plain FIFO, deliberately not
    // a true LRU: for a cache this small and this short-lived, tracking
    // access order costs more than the eviction accuracy is worth.
    if (store.size >= MAX_ENTRIES) {
      const oldest = store.keys().next();
      if (!oldest.done) store.delete(oldest.value);
    }
  }

  store.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

/** Drops a key immediately — used after a write, so the next read is fresh. */
export function invalidate(key: string): void {
  store.delete(key);
}

/**
 * Drops every key starting with `prefix`.
 *
 * The exact-key `invalidate` above can only clear entries whose full key the
 * writer can reconstruct. The day/week grids cache under
 * `calendar-range:{email}:{fromISO}:{toISO}` — an unbounded set of windows the
 * writer has no way to enumerate — so after creating or deleting an event they
 * kept serving the pre-write calendar for the rest of the TTL, which reads as
 * "the delete didn't work". Clearing by prefix is the only honest option.
 */
export function invalidatePrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/** Test-only: reset all state between cases. */
export function __clearCache(): void {
  store.clear();
}
