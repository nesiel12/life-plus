// YouTube URL handling for the in-app video hub. Kept pure and separate from
// the components because three surfaces need to agree on the same video id:
// the embed player, the thumbnail, and the transcript fetch that feeds the
// StudyAgent. A mismatch would mean summarizing a different video than the
// one on screen.

const VIDEO_ID = /^[\w-]{11}$/;

/**
 * Extracts the 11-character video id from any common YouTube URL shape, or
 * from a bare id. Returns null for anything that isn't YouTube — callers must
 * not pass an arbitrary URL through to an embed.
 */
export function youtubeVideoId(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (VIDEO_ID.test(value)) return value;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^(www\.|m\.)/, "");

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return VIDEO_ID.test(id) ? id : null;
  }

  if (host !== "youtube.com" && host !== "music.youtube.com") return null;

  const param = url.searchParams.get("v");
  if (param && VIDEO_ID.test(param)) return param;

  // /embed/<id>, /shorts/<id>, /live/<id>
  const match = /^\/(embed|shorts|live|v)\/([\w-]{11})/.exec(url.pathname);
  return match ? match[2] : null;
}

/** Privacy-enhanced embed host: no cookies until the viewer actually plays. */
export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}`;
}

export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * A YouTube search for a suggested topic.
 *
 * The learning-path generator returns *search terms* for YouTube, not links
 * — deliberately, because a model asked for real video URLs invents video
 * ids that 404. Those rows therefore have no url and had no affordance at
 * all: a suggestion the user could read and nothing else. Turning the term
 * into a search is the honest way to make it actionable — it says "here is
 * where to look", which is exactly what the model actually produced.
 */
export function youtubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}
