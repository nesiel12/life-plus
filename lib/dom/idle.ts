"use client";

/**
 * Runs `fn` when the browser is next idle (falls back to a short timeout on
 * Safari, which has no `requestIdleCallback`). Returns a canceller for a
 * cleanup effect. Used for background work — prefetching, cache warm-up —
 * that must never compete with the current render or a real user gesture.
 */
export function onIdle(fn: () => void, timeoutMs = 2000): () => void {
  if (typeof window === "undefined") return () => {};
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(fn, { timeout: timeoutMs });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(fn, Math.min(timeoutMs, 1500));
  return () => window.clearTimeout(id);
}
