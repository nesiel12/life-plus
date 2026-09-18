import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { suggestBooks } from "@/lib/torah/sources/providers";

export const runtime = "nodejs";

// Typed into on every keystroke (debounced client-side), so the window is
// generous but bounded — this fans out to two third-party APIs, and an
// unthrottled search box is an easy way to get an IP rate-limited by Google.
const RATE_LIMIT = { limit: 40, windowMs: 60 * 1000 };

/**
 * The rich dropdown behind "type a book name".
 *
 * Returns provider suggestions only — nothing is written. The user's library
 * is untouched until they actually pick one (POST /api/torah/books).
 *
 * Never fails the request on a provider outage: suggestBooks() already
 * returns an empty list rather than throwing, so a dead Sefaria degrades the
 * dropdown to Google's results (or to nothing, and the plain "add with the
 * title I typed" path still works).
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(
    `torah-book-search:${session.user.email}`,
    RATE_LIMIT.limit,
    RATE_LIMIT.windowMs
  );
  if (limited) return limited;

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  // Below two characters every query matches half the library; the providers
  // would be doing real work to return noise.
  if (query.length < 2) return NextResponse.json({ results: [] });

  try {
    const results = await suggestBooks(query, 8);
    return NextResponse.json({ results });
  } catch {
    // suggestBooks swallows provider errors itself, so reaching here means
    // something unexpected. An empty dropdown is the right degradation —
    // the user can still add the book by typing its name.
    return NextResponse.json({ results: [] });
  }
}
