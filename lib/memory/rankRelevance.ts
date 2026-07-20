// Memory Engine v1 (docs/ATLAS_ARCHITECTURE_VISION.md §2): pure lexical
// relevance ranking, no external services or new infrastructure. Good
// enough at single-user, hundreds-of-rows scale — the intentional first
// step before full-text search (v2) or embeddings (v3), not a placeholder
// for them.
export interface MemoryCandidate {
  id: string;
  text: string; // searched against the query
  timestamp: string; // ISO date or datetime, used for the recency boost
  label: string; // formatted for inclusion in an LLM prompt
}

export interface RankedMemory extends MemoryCandidate {
  score: number;
}

const RECENCY_HALF_LIFE_DAYS = 30;

// Exported for lib/intelligence/personalDNA/analyzers/learning.ts, which
// reuses the same tokenization for topic-frequency analysis rather than
// re-implementing it.
export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length > 1)
  );
}

export function rankByRelevance(
  query: string,
  candidates: MemoryCandidate[],
  limit = 5,
  now: number = Date.now()
): RankedMemory[] {
  const queryTokens = tokenize(query);
  if (queryTokens.size === 0) return [];

  const scored: RankedMemory[] = candidates.map((candidate) => {
    const candidateTokens = tokenize(candidate.text);
    let overlap = 0;
    for (const token of queryTokens) {
      if (candidateTokens.has(token)) overlap += 1;
    }
    if (overlap === 0) return { ...candidate, score: 0 };

    const ageDays = Math.max(0, (now - new Date(candidate.timestamp).getTime()) / 86_400_000);
    const recencyBoost = RECENCY_HALF_LIFE_DAYS / (RECENCY_HALF_LIFE_DAYS + ageDays);
    return { ...candidate, score: overlap + recencyBoost };
  });

  return scored
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
