import "server-only";

import { getJson, getText } from "@/lib/torah/sources/http";
import { parseIsoDuration } from "@/lib/torah/lessons/timecode";

// YouTube lessons for Book and Rabbi pages.
//
// Three honest sources, in order of how much they can be trusted:
//
//   1. The rabbi's official channel feed. YouTube publishes a keyless Atom
//      feed per channel (the latest ~15 uploads). When the user has recorded
//      the channel URL, this is the rav's own shiurim — no search ranking,
//      no lookalike channels.
//   2. The YouTube Data API search, when YOUTUBE_API_KEY is configured.
//      Real videos with real ids, ranked by YouTube.
//   3. Search links. Without a key, the page offers the queries as YouTube
//      searches rather than pretending — a model asked for video ids invents
//      ones that 404 (see lib/learning/youtube.ts).
//
// Everything is null/empty on failure, like every provider in this folder.

export interface YoutubeVideo {
  videoId: string;
  title: string;
  channelTitle?: string;
  publishedAt?: string;
  thumbnailUrl: string;
  source: "channel" | "search";
}

const CHANNEL_ID = /^UC[\w-]{22}$/;

/** The channel id when a URL already contains it (/channel/UC…). */
export function channelIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const match = /^\/channel\/(UC[\w-]{22})/.exec(parsed.pathname);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

/**
 * Parses YouTube's channel Atom feed.
 *
 * A handful of regexes rather than an XML library: the feed's shape has been
 * stable for a decade, only four fields are read, and a malformed entry is
 * skipped rather than failing the list.
 */
export function parseChannelFeed(xml: string, limit = 12): YoutubeVideo[] {
  const channelTitle = /<author>\s*<name>([\s\S]*?)<\/name>/.exec(xml)?.[1];
  const videos: YoutubeVideo[] = [];

  for (const entry of xml.split("<entry>").slice(1)) {
    const videoId = /<yt:videoId>([\w-]{11})<\/yt:videoId>/.exec(entry)?.[1];
    const title = /<title>([\s\S]*?)<\/title>/.exec(entry)?.[1];
    if (!videoId || !title) continue;
    videos.push({
      videoId,
      title: decodeXml(title),
      channelTitle: channelTitle ? decodeXml(channelTitle) : undefined,
      publishedAt: /<published>([^<]+)<\/published>/.exec(entry)?.[1],
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      source: "channel",
    });
    if (videos.length >= limit) break;
  }

  return videos;
}

/**
 * Resolves any channel URL to its UC… id.
 *
 * /channel/UC… URLs carry it directly. Handle (@name), /c/ and /user/ URLs do
 * not, so the channel page is fetched once and its canonical link read —
 * cached for a day like every provider call.
 */
export async function resolveChannelId(channelUrl: string): Promise<string | null> {
  const direct = channelIdFromUrl(channelUrl);
  if (direct) return direct;

  let parsed: URL;
  try {
    parsed = new URL(channelUrl);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^(www\.|m\.)/, "");
  if (host !== "youtube.com") return null;

  const html = await getText(`https://www.youtube.com${parsed.pathname}`, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; LifePlus/1.0)", "accept-language": "he" },
  });
  if (!html) return null;

  const canonical = /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/.exec(html)?.[1];
  const external = /"externalId":"(UC[\w-]{22})"/.exec(html)?.[1];
  const id = canonical ?? external ?? null;
  return id && CHANNEL_ID.test(id) ? id : null;
}

/** The latest uploads of a channel, keyless. */
export async function channelVideos(channelUrl: string, limit = 12): Promise<YoutubeVideo[]> {
  const channelId = await resolveChannelId(channelUrl);
  if (!channelId) return [];
  // An hour, not a day: this is the one provider feed that actually changes.
  const xml = await getText(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, { revalidate: 60 * 60 });
  return xml ? parseChannelFeed(xml, limit) : [];
}

export function isYoutubeSearchConfigured(): boolean {
  return Boolean(process.env.YOUTUBE_API_KEY);
}

interface YoutubeSearchResult {
  items?: {
    id?: { videoId?: string };
    snippet?: {
      title?: string;
      channelTitle?: string;
      publishedAt?: string;
      thumbnails?: { high?: { url?: string }; medium?: { url?: string } };
    };
  }[];
}

/** YouTube Data API search. Empty when no key is configured or the call fails. */
export async function youtubeSearch(query: string, limit = 8): Promise<YoutubeVideo[]> {
  const key = process.env.YOUTUBE_API_KEY;
  const trimmed = query.trim();
  if (!key || trimmed.length < 2) return [];

  const url =
    "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video" +
    `&maxResults=${Math.min(limit, 25)}&relevanceLanguage=he&safeSearch=strict` +
    `&q=${encodeURIComponent(trimmed)}&key=${key}`;

  // Six hours: a search costs 100 of the API's 10,000 daily quota units, and
  // the answer to "shiurim on Mesillat Yesharim" does not change hourly.
  const result = await getJson<YoutubeSearchResult>(url, { revalidate: 60 * 60 * 6 });
  return (result?.items ?? [])
    .map((item): YoutubeVideo | null => {
      const videoId = item.id?.videoId;
      const title = item.snippet?.title;
      if (!videoId || !title) return null;
      return {
        videoId,
        title: decodeXml(title),
        channelTitle: item.snippet?.channelTitle ? decodeXml(item.snippet.channelTitle) : undefined,
        publishedAt: item.snippet?.publishedAt,
        thumbnailUrl: item.snippet?.thumbnails?.high?.url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        source: "search",
      };
    })
    .filter((video): video is YoutubeVideo => video !== null);
}

export interface YoutubeVideoDetails {
  videoId: string;
  title: string;
  channelTitle?: string;
  durationSeconds: number | null;
  /**
   * The uploader's own description, Data-API only (oEmbed doesn't carry it).
   * A shiur's description is often a written outline — the richest fallback
   * text available when there is no transcript (see fetch-youtube's route).
   * Trimmed to a few paragraphs; a video's description can run to thousands
   * of characters of links and boilerplate that add nothing to a summary.
   */
  description?: string;
}

const MAX_DESCRIPTION_CHARS = 1500;

interface VideosResult {
  items?: { snippet?: { title?: string; channelTitle?: string; description?: string }; contentDetails?: { duration?: string } }[];
}

/**
 * Title, channel, duration and (Data API only) description for one video.
 *
 * The Data API when a key is configured — the only source of the video's
 * DURATION and DESCRIPTION, which the transcription planner and the
 * no-transcript AI summary fallback need respectively. Falls back to oEmbed
 * (title and channel only) without a key.
 */
export async function youtubeVideoDetails(videoId: string): Promise<YoutubeVideoDetails | null> {
  const key = process.env.YOUTUBE_API_KEY;
  if (key) {
    const result = await getJson<VideosResult>(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${encodeURIComponent(videoId)}&key=${key}`,
      { revalidate: 60 * 60 }
    );
    const item = result?.items?.[0];
    if (item?.snippet?.title) {
      const description = item.snippet.description?.trim();
      return {
        videoId,
        title: decodeXml(item.snippet.title),
        channelTitle: item.snippet.channelTitle,
        durationSeconds: parseIsoDuration(item.contentDetails?.duration),
        description: description ? decodeXml(description).slice(0, MAX_DESCRIPTION_CHARS) : undefined,
      };
    }
    if (result && (result.items ?? []).length === 0) return null;
  }

  const oembed = await getJson<{ title?: string; author_name?: string }>(
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`
  );
  return oembed?.title
    ? { videoId, title: oembed.title, channelTitle: oembed.author_name, durationSeconds: null }
    : null;
}
