// Outbound links for Book and Rabbi pages — client-safe (no server-only
// imports), so the pages and the API routes build the same URLs.
//
// Search links rather than guessed product URLs: a store's URL scheme for a
// specific edition is not something to invent, but "search this title" is
// always true and always lands somewhere useful.

/** The public Sefaria reading URL for a ref or an index title, Hebrew interface. */
export function sefariaReadUrl(refOrTitle: string): string {
  return `https://www.sefaria.org/${encodeURIComponent(refOrTitle.trim().replace(/\s+/g, "_"))}?lang=he`;
}

/** Sefaria's author page. */
export function sefariaAuthorUrl(slug: string): string {
  return `https://www.sefaria.org/topics/${encodeURIComponent(slug)}?lang=he`;
}

/** Price comparison for a sefer, as a Google Shopping search. */
export function priceSearchUrl(title: string, author?: string): string {
  const query = ["ספר", title, author].filter(Boolean).join(" ");
  return `https://www.google.com/search?tbm=shop&hl=iw&q=${encodeURIComponent(query)}`;
}

/** A plain web search — for finding a store, a review, or a rav's community. */
export function webSearchUrl(query: string): string {
  return `https://www.google.com/search?hl=iw&q=${encodeURIComponent(query)}`;
}

export function googleBooksUrl(volumeId: string): string {
  return `https://books.google.com/books?id=${encodeURIComponent(volumeId)}&hl=iw`;
}

export function youtubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}
