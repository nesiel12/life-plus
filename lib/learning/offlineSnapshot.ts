import { useAtlasStore } from "@/store/useAtlasStore";
import type { LearningIndexSnapshot } from "@/lib/query/offlineKeys";

export const isLearningRoute = (pathname: string) => pathname.startsWith("/areas/learning");

/**
 * Seeds only the store's learning slice from the device snapshot (an offline
 * cold start). Everything else stays at its empty defaults — callers must not
 * treat the store as a real bootstrap. Returns whether a snapshot existed.
 */
export function hydrateFromLearningSnapshot(snapshot: LearningIndexSnapshot | undefined): boolean {
  if (!snapshot) return false;
  useAtlasStore.setState({ learningTopics: snapshot.topics, learningResources: snapshot.resources, hydrated: true });
  return true;
}
