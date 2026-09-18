import "server-only";

// The one fetch helper every Torah source provider uses.
//
// Every caller wants the same thing on failure — nothing, so it can fall
// back — and none of them want a hung request holding a serverless
// invocation open. Returning null rather than throwing means call sites read
// as data flow instead of a pile of try/catch.

// Nothing here is worth making the user wait on. A slow provider is treated
// exactly like a missing one.
const TIMEOUT_MS = 6000;

// Provider metadata changes on the order of never; a day of cache removes
// almost all of this traffic and makes a second visit feel instant.
const DEFAULT_REVALIDATE_SECONDS = 60 * 60 * 24;

interface FetchOptions {
  /** Seconds of Next's data cache. Short for feeds that actually change. */
  revalidate?: number;
  headers?: Record<string, string>;
}

async function fetchWithTimeout(url: string, accept: string, options: FetchOptions): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept, ...options.headers },
      next: { revalidate: options.revalidate ?? DEFAULT_REVALIDATE_SECONDS },
    });
    return response.ok ? response : null;
  } catch {
    // Includes the abort. Deliberately silent: a provider timeout is an
    // expected outcome here, not an application error, and logging it per
    // request would bury real failures.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function getJson<T>(url: string, options: FetchOptions = {}): Promise<T | null> {
  const response = await fetchWithTimeout(url, "application/json", options);
  if (!response) return null;
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function getText(url: string, options: FetchOptions = {}): Promise<string | null> {
  const response = await fetchWithTimeout(url, "text/html,application/xml;q=0.9,*/*;q=0.8", options);
  if (!response) return null;
  try {
    return await response.text();
  } catch {
    return null;
  }
}
