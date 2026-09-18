import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getUserByEmail } from "@/lib/db/users";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { booksRepo } from "@/lib/db/books";
import { rabbisRepo } from "@/lib/db/rabbis";
import { hebrewOnly } from "@/lib/torah/hebrew";
import { mediaSearchQueries, youtubeChannelHref, type RabbiWork } from "@/lib/torah/rabbiProfile";
import { channelVideos, isYoutubeSearchConfigured, youtubeSearch, type YoutubeVideo } from "@/lib/torah/sources/youtube";

export const runtime = "nodejs";

const RATE_LIMIT = { limit: 30, windowMs: 5 * 60 * 1000 };

/**
 * YouTube lessons for a Book or Rabbi page.
 *
 *   GET /api/torah/media?type=rabbi&id=…
 *   GET /api/torah/media?type=book&id=…
 *
 * Returns the rabbi's official channel uploads (keyless feed, when a channel
 * is recorded), YouTube search results (when YOUTUBE_API_KEY is set), and the
 * search queries themselves — which the page offers as links when there is no
 * key, so the section is useful either way and never fabricates a video.
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`torah-media:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const user = await getUserByEmail(session.user.email);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const type = params.get("type");
  const id = params.get("id") ?? "";
  if ((type !== "book" && type !== "rabbi") || !id) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  let name: string;
  let channelUrl: string | null = null;
  let works: RabbiWork[] = [];

  if (type === "rabbi") {
    const row = await rabbisRepo.get(user.id, id);
    if (!row) return NextResponse.json({ error: "הרב לא נמצא." }, { status: 404 });
    name = hebrewOnly(row.hebrew_name) ?? row.name;
    channelUrl = youtubeChannelHref(row.youtube_channel_url);
    works = Array.isArray(row.works) ? (row.works as unknown as RabbiWork[]) : [];
  } else {
    const row = await booksRepo.get(user.id, id);
    if (!row) return NextResponse.json({ error: "הספר לא נמצא." }, { status: 404 });
    name = hebrewOnly(row.hebrew_title) ?? row.title;
    // A book's author's channel is the most trustworthy place for shiurim
    // on it, when the author is a rabbi with one recorded.
    if (row.author_rabbi_id) {
      const author = await rabbisRepo.get(user.id, row.author_rabbi_id);
      channelUrl = youtubeChannelHref(author?.youtube_channel_url);
    }
  }

  const queries = mediaSearchQueries({ name, works, kind: type });
  const searchConfigured = isYoutubeSearchConfigured();

  const [channel, search] = await Promise.all([
    channelUrl ? channelVideos(channelUrl, 9).catch(() => [] as YoutubeVideo[]) : Promise.resolve([]),
    searchConfigured && queries[0] ? youtubeSearch(queries[0], 9).catch(() => [] as YoutubeVideo[]) : Promise.resolve([]),
  ]);

  // A channel video that also came back from search is shown once, as the
  // channel's — the more trustworthy of the two.
  const channelIds = new Set(channel.map((v) => v.videoId));

  return NextResponse.json({
    channel,
    search: search.filter((v) => !channelIds.has(v.videoId)),
    queries,
    searchConfigured,
    channelConfigured: Boolean(channelUrl),
  });
}
