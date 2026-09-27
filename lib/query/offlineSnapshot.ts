import { useAtlasStore } from "@/store/useAtlasStore";
import type { OfflineBootstrapSnapshot } from "@/lib/query/offlineKeys";

/**
 * Seeds the WHOLE store from the device snapshot (an offline cold start) —
 * every domain the real bootstrap (getInitialState) would set, so the app
 * behaves like a normal load: `hydrate()` itself would do the same
 * `{...state, hydrated: true}` spread for a live bootstrap; this is that
 * same shape, replayed from IndexedDB instead of a network call. Returns
 * whether a snapshot existed.
 */
export function hydrateFromOfflineSnapshot(snapshot: OfflineBootstrapSnapshot | undefined): boolean {
  if (!snapshot) return false;
  useAtlasStore.setState({ ...snapshot.state, hydrated: true });
  return true;
}
