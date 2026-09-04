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

  try {
    const segments = await YoutubeTranscript.fetchTranscript(parsed.data.url);
    const text = segments
      .map((s) => s.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (!text) {
      return NextResponse.json({ error: "לא נמצא תמלול עבור הסרטון הזה." }, { status: 422 });
    }

    return NextResponse.json({ text });
  } catch (err) {
    if (err instanceof YoutubeTranscriptDisabledError || err instanceof YoutubeTranscriptNotAvailableError) {
      return NextResponse.json({ error: "לסרטון הזה אין כתוביות/תמלול זמין." }, { status: 422 });
    }
    if (err instanceof YoutubeTranscriptVideoUnavailableError) {
      return NextResponse.json({ error: "הסרטון אינו זמין (הוסר, פרטי, או מוגבל אזורית)." }, { status: 422 });
    }
    if (err instanceof YoutubeTranscriptTooManyRequestError) {
      return NextResponse.json({ error: "יותר מדי בקשות ל-YouTube כרגע. נסה שוב בעוד כמה דקות." }, { status: 429 });
    }
    console.error("YouTube transcript fetch failed:", err);
    return NextResponse.json({ error: "שליפת התמלול מהסרטון נכשלה. נסה שוב." }, { status: 500 });
  }
}
