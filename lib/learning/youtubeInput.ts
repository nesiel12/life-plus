import { youtubeEmbedUrl, youtubeThumbnailUrl, youtubeVideoId, youtubeWatchUrl } from "@/lib/learning/youtube";

// Reading a pasted YouTube link in the Curiosity Radar.
//
// lib/learning/youtube.ts already knows every URL shape and builds the embed,
// thumbnail and watch URLs; this adds what a *search box* needs on top:
// finding a link inside pasted text, reading its start time, and — crucially —
// refusing everything that is not a link.
//
// That last part is not pedantry. youtubeVideoId() deliberately accepts a bare
// 11-character id, and 11 characters is also "programming", "photography" and
// "philosophy". A search box that treated those as videos would pop a broken
// thumbnail every time someone typed a topic. So a video is only ever
// recognised from a URL here.

const MAX_START_SECONDS = 24 * 3600 - 1;

const clampSeconds = (n: number) => (Number.isFinite(n) ? Math.min(MAX_START_SECONDS, Math.max(0, Math.floor(n))) : 0);

/**
 * A YouTube start time: "90", "1m30s", "1h2m3s", "2:05" or "1:02:03" → seconds.
 * Anything else is 0 — starting from the top is always a safe reading.
 */
export function parseYoutubeTimestamp(raw: string | null | undefined): number {
  const value = raw?.trim().toLowerCase();
  if (!value) return 0;

  if (/^\d+$/.test(value)) return clampSeconds(Number(value));

  const units = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (units && (units[1] || units[2] || units[3])) {
    return clampSeconds(Number(units[1] ?? 0) * 3600 + Number(units[2] ?? 0) * 60 + Number(units[3] ?? 0));
  }

  const clock = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(value);
  if (clock) {
    return clampSeconds(Number(clock[1] ?? 0) * 3600 + Number(clock[2]) * 60 + Number(clock[3]));
  }

  return 0;
}

const URL_IN_TEXT = /(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)\/[^\s<>"'`]+/gi;

/** The first real YouTube link inside `text`, normalised to an https URL. */
export function findYoutubeUrl(text: string): string | null {
  for (const match of text.matchAll(URL_IN_TEXT)) {
    // The protocol and "www." are optional in the pattern, so without this a
    // look-alike host ("notyoutube.com/…", "evilyoutu.be/…") would match from
    // its middle and be taken for the real thing. A link has to start where a
    // word starts. (A manual check, not a lookbehind: older Safari cannot parse
    // lookbehind at all, which would break this whole module on load.)
    const before = match.index > 0 ? text[match.index - 1] : "";
    if (/[\w.-]/.test(before)) continue;

    // A link at the end of a sentence drags its punctuation along.
    const candidate = match[0].replace(/[),.;!?]+$/, "");
    const url = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
    if (youtubeVideoId(url)) return url;
  }
  return null;
}

export interface ParsedVideo {
  videoId: string;
  /** Where playback should begin; 0 unless the link carried a start time. */
  startSeconds: number;
  thumbnailUrl: string;
  embedUrl: string;
  watchUrl: string;
}

/**
 * A pasted YouTube link → everything the preview and the player need, or null.
 * Accepts a link anywhere in the text ("watch this: https://youtu.be/…"), never
 * a bare id (see the note at the top).
 */
export function parseVideoInput(input: string): ParsedVideo | null {
  const found = findYoutubeUrl(input.trim());
  if (!found) return null;

  const videoId = youtubeVideoId(found);
  if (!videoId) return null;

  let startSeconds = 0;
  try {
    const url = new URL(found);
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    startSeconds = parseYoutubeTimestamp(url.searchParams.get("t") ?? url.searchParams.get("start") ?? hash.get("t"));
  } catch {
    // youtubeVideoId already parsed it; a URL that cannot be re-read has no start time.
  }

  return {
    videoId,
    startSeconds,
    thumbnailUrl: youtubeThumbnailUrl(videoId),
    embedUrl: startSeconds > 0 ? `${youtubeEmbedUrl(videoId)}?start=${startSeconds}` : youtubeEmbedUrl(videoId),
    watchUrl: startSeconds > 0 ? `${youtubeWatchUrl(videoId)}&t=${startSeconds}s` : youtubeWatchUrl(videoId),
  };
}

/** True for text that is plausibly a link, so the box can glow for it before it parses. */
export function looksLikeUrl(text: string): boolean {
  return /^(https?:\/\/|www\.)\S+$/i.test(text.trim());
}

/** "3:05" or "1:02:03" — for showing a start time. */
export function formatClock(totalSeconds: number): string {
  const s = clampSeconds(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}
