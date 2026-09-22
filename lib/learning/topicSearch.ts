// Filtering the topic grid as the person types.

const NIQQUD_AND_CANTILLATION = /[֑-ׇ]/g;

/** Case-folded, niqqud-free, punctuation-free, single-spaced — comparable text. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(NIQQUD_AND_CANTILLATION, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface Searchable {
  id: string;
  title: string;
  category?: string;
}

/**
 * Topics matching every word of `query`, in their original order. A word may
 * match the title, the category or the title of any of the topic's resources —
 * so "פייתון" finds the topic even when only one video in it says so. An empty
 * query matches everything.
 */
export function filterTopics<T extends Searchable>(
  topics: readonly T[],
  resources: readonly { topicId: string; title: string }[],
  query: string
): T[] {
  const words = normalizeText(query).split(" ").filter(Boolean);
  if (words.length === 0) return [...topics];

  const resourceText = new Map<string, string[]>();
  for (const resource of resources) {
    const list = resourceText.get(resource.topicId) ?? [];
    list.push(resource.title);
    resourceText.set(resource.topicId, list);
  }

  return topics.filter((topic) => {
    const haystack = normalizeText([topic.title, topic.category ?? "", ...(resourceText.get(topic.id) ?? [])].join(" "));
    return words.every((word) => haystack.includes(word));
  });
}
