import { youtubeWatchUrl } from "@/lib/learning/youtube";

// The title of a pasted video, from YouTube's public oEmbed endpoint — the
// documented way to ask "what is this link?" without an API key. Optional
// polish: if it fails (offline, a private video, a CORS hiccup) the preview
// simply shows the thumbnail without a title, and nothing else depends on it.

export interface VideoMeta {
  title: string;
  author: string | null;
}

const MAX_TITLE = 120;

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

/** Validates oEmbed JSON. Anything without a usable title is null. */
export function parseOembed(json: unknown): VideoMeta | null {
  if (!json || typeof json !== "object") return null;
  const { title, author_name: author } = json as { title?: unknown; author_name?: unknown };
  if (typeof title !== "string") return null;

  const clean = collapse(title);
  if (!clean) return null;

  return {
    title: clean.length > MAX_TITLE ? `${clean.slice(0, MAX_TITLE - 1)}…` : clean,
    author: typeof author === "string" && collapse(author) ? collapse(author) : null,
  };
}

export async function fetchVideoMeta(
  videoId: string,
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {}
): Promise<VideoMeta | null> {
  const doFetch = options.fetchImpl ?? fetch;
  try {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeWatchUrl(videoId))}&format=json`;
    const res = await doFetch(url, { signal: options.signal });
    if (!res.ok) return null;
    return parseOembed(await res.json());
  } catch {
    return null;
  }
}
