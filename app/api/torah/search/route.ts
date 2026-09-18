import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { searchTorahSources } from "@/lib/torah/sources/providers";

export const runtime = "nodejs";

// Typed into on every keystroke (debounced client-side), so the window is
// generous but bounded — this fans out to two third-party APIs, and an
// unthrottled search box is an easy way to get an IP rate-limited by Google.
const RATE_LIMIT = { limit: 60, windowMs: 60 * 1000 };

/**
 * The remote half of the מרחב תורה search command center: books from Sefaria
 * and Google Books, and author topics from Sefaria.
 *
 * The local half — the user's own books, rabbis and summaries — is searched
 * in the browser over the store, so it is instant and never waits on this.
 *
 * Read-only: nothing is added to the library until the user picks a result.
 * Never fails the request on a provider outage; an empty result still leaves
 * the "add what I typed" actions working.
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`torah-search:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 120) return NextResponse.json({ books: [], authors: [] });

  try {
    return NextResponse.json(await searchTorahSources(query, 8));
  } catch {
    return NextResponse.json({ books: [], authors: [] });
  }
}
