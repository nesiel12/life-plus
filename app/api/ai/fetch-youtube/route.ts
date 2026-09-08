import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  YoutubeTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptVideoUnavailableError,
  YoutubeTranscriptTooManyRequestError,
} from "youtube-transcript";
import { authOptions } from "@/lib/auth";
import { rateLimitResponse } from "@/lib/api/rateLimit";

// Transcript-fetching half of the Torah Space AI Summarizer's YouTube flow:
// given a video URL, returns its caption text as one plain string. The
// frontend then feeds that straight into /api/ai/summarize-shiur — this
// route does no summarization itself, only extraction, same
// single-responsibility split as extract's PDF/audio branches.

export const runtime = "nodejs";
export const maxDuration = 60;

const RATE_LIMIT = { limit: 10, windowMs: 5 * 60 * 1000 }; // 10 fetches / 5 min

// Only accept URLs that are actually youtube.com/youtu.be — the library
// would fail closed on anything else anyway (it extracts a video ID from
// known YouTube URL shapes), but rejecting up front avoids handing an
// arbitrary user-supplied URL string to a third-party parser at all.
const YOUTUBE_HOST_PATTERN = /^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i;

const requestSchema = z.object({
  url: z
    .string()
    .url()
    .refine((url) => YOUTUBE_HOST_PATTERN.test(url), "URL must be a youtube.com or youtu.be link"),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`fetch-youtube:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "יש להזין קישור תקין לסרטון YouTube." }, { status: 400 });
  }

  // Public oEmbed — no API key, no quota. Gives us the title and channel even
  // when captions are off, which is what the AI's metadata-only fallback
  // summary is built from.
  const meta = await fetchOembed(parsed.data.url);

  try {
    const segments = await YoutubeTranscript.fetchTranscript(parsed.data.url);
    const text = segments
      .map((s) => s.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (!text) {
      // No transcript, but the video still plays and the AI can still give a
      // metadata-based overview — 200 with meta, not an error.
      return NextResponse.json({ meta, transcriptError: "לא נמצא תמלול עבור הסרטון הזה." });
    }

    return NextResponse.json({ text, meta });
  } catch (err) {
    let transcriptError = "שליפת התמלול מהסרטון נכשלה.";
    if (err instanceof YoutubeTranscriptDisabledError || err instanceof YoutubeTranscriptNotAvailableError) {
      transcriptError = "לסרטון הזה אין כתוביות/תמלול זמין.";
    } else if (err instanceof YoutubeTranscriptVideoUnavailableError) {
      // A genuinely unavailable video can't be summarised either — keep this an error.
      return NextResponse.json({ error: "הסרטון אינו זמין (הוסר, פרטי, או מוגבל אזורית)." }, { status: 422 });
    } else if (err instanceof YoutubeTranscriptTooManyRequestError) {
      transcriptError = "יותר מדי בקשות ל-YouTube כרגע — נסה שוב בעוד כמה דקות.";
    } else {
      console.error("YouTube transcript fetch failed:", err);
    }
    // The player works and the metadata summary works — degrade, don't fail.
    return NextResponse.json({ meta, transcriptError });
  }
}

interface OembedMeta {
  title: string;
  author: string | null;
}

async function fetchOembed(url: string): Promise<OembedMeta | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(6_000) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string; author_name?: string };
    if (!data.title) return null;
    return { title: data.title, author: data.author_name ?? null };
  } catch {
    return null;
  }
}
