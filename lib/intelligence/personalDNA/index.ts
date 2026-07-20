import "server-only";
import { personalPatternsRepo } from "@/lib/db/personalPatterns";
import { rankPatterns, MIN_CONFIDENCE_TO_SURFACE } from "@/lib/intelligence/personalDNA/confidence";

export { analyzePersonalDNA } from "@/lib/intelligence/personalDNA/analyze";

// The read path — used by the Context Engine (lib/context/
// buildAtlasContext.ts) and anything else that wants "what does Atlas
// currently believe about this user." Only returns patterns confident
// enough to act on (MIN_CONFIDENCE_TO_SURFACE); weaker assumptions stay
// stored but silent. Returns plain description strings, not raw rows, so
// callers never need to know about personal_patterns' shape.
export async function getPersonalPatternDescriptions(userId: string, limit = 5): Promise<string[]> {
  const patterns = await personalPatternsRepo.list(userId);
  return rankPatterns(patterns, limit, MIN_CONFIDENCE_TO_SURFACE).map((pattern) => pattern.description);
}
