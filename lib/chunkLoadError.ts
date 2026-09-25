// Whether a caught error is a browser's "a JS chunk failed to load" failure
// — pulled out as its own pure module (the same "pure module the client
// file imports from" split this codebase uses throughout, e.g.
// lib/goals/deriveGoalStage.ts) so it's unit-testable without pulling in
// app/error.tsx's own "use client" directive and JSX.
//
// Cross-browser: Chrome/Edge name it "ChunkLoadError"; Firefox says "error
// loading dynamically imported module"; Safari says "Importing a module
// script failed". A live, real "Failed to load chunk" report on
// 2026-09-25 is why this exists.
//
// Two genuinely different causes surface as the same message, and only one
// is fixed by retrying the same request (see lib/dynamicImport.ts's
// retryImport, which already resolves that one before an error ever
// reaches app/error.tsx): a transient network blip on an otherwise-valid
// chunk URL, versus a STALE client whose already-loaded bundle asks for a
// chunk hash that no longer exists on the server after a new deploy — no
// amount of retrying the same URL fixes that; only a fresh page load
// (new HTML, new chunk manifest) does. app/error.tsx uses this classifier
// to offer that reload instead of a plain in-place `reset()`, which would
// just re-render the same stale bundle and fail identically.
export function isChunkLoadError(error: Error): boolean {
  const text = `${error.name} ${error.message}`.toLowerCase();
  return (
    text.includes("chunkloaderror") ||
    text.includes("loading chunk") ||
    text.includes("failed to load chunk") ||
    text.includes("error loading dynamically imported module") ||
    text.includes("importing a module script failed")
  );
}
