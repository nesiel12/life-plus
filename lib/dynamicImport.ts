// A retrying wrapper around a next/dynamic loader (`() => import("...")`).
//
// Two genuinely different failure modes both surface as the same "Failed to
// load chunk" browser error, and only one of them is worth retrying:
//
//   1. A transient network blip on an otherwise-valid chunk URL — the exact
//      request would very likely succeed a moment later. This is what
//      retrying actually fixes.
//   2. A STALE client: the tab loaded before the app's last deploy, and the
//      chunk hash its bundle is asking for no longer exists on the server
//      (a new deploy rewrote the manifest). No amount of retrying the same
//      URL fixes this — the fix is a full page reload, which fetches the
//      current HTML and chunk manifest. Retrying here just delays the
//      inevitable identical failure. app/error.tsx's own ChunkLoadError
//      detection is what handles this half — if every retry below still
//      fails, the error that finally propagates reaches that boundary.
//
// Cross-browser: Chrome/Edge throw "ChunkLoadError"; Firefox says "error
// loading dynamically imported module"; Safari says "Importing a module
// script failed". All three are treated as retryable here — a genuinely
// stale chunk will fail identically on every retry regardless of browser,
// so retrying costs a few hundred ms in that case and nothing in the common
// (transient network) one.

const DEFAULT_RETRIES = 2;
const RETRY_DELAY_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps a dynamic import so a transient chunk-load failure resolves on its
 * own instead of reaching the page's error boundary. Use as next/dynamic's
 * loader: `dynamic(() => retryImport(() => import("./Heavy")), {...})`.
 */
export async function retryImport<T>(load: () => Promise<T>, retries = DEFAULT_RETRIES): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await load();
    } catch (err) {
      lastError = err;
      if (attempt < retries) await sleep(RETRY_DELAY_MS * (attempt + 1));
    }
  }
  throw lastError;
}
