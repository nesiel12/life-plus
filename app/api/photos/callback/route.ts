import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import { appBaseUrl } from "@/lib/appUrl";
import { getCurrentUserId } from "@/lib/currentUser";
import { exchangeCodeForTokens } from "@/lib/photos/auth";

export const runtime = "nodejs";

const STATE_COOKIE = "lifeplus.photos.oauth_state";
const RETURN_COOKIE = "lifeplus.photos.oauth_return";

function safeReturnPath(raw: string | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/areas/family";
  return raw.split("?")[0]; // drop any pre-existing query; we add our own
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  const jar = await cookies();
  const returnTo = safeReturnPath(jar.get(RETURN_COOKIE)?.value);
  const expected = jar.get(STATE_COOKIE)?.value;
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");

  // Consume the nonces regardless of outcome so they can't be replayed.
  jar.delete(STATE_COOKIE);
  jar.delete(RETURN_COOKIE);

  const back = (query: string) => NextResponse.redirect(`${appBaseUrl()}${returnTo}?${query}`);

  if (!session?.user?.email) {
    return NextResponse.redirect(`${appBaseUrl()}/login`);
  }
  if (!expected || !state || state !== expected) {
    return back("photos=state_mismatch");
  }

  // Google puts the reason for a refused consent in the query string, not in
  // the code exchange — surface it rather than a bare "denied".
  const oauthError = request.nextUrl.searchParams.get("error");
  if (oauthError) {
    return back(`photos=denied&reason=${encodeURIComponent(oauthError)}`);
  }
  if (!code) {
    return back("photos=denied");
  }

  try {
    await exchangeCodeForTokens(await getCurrentUserId(), code);
    return back("photos=connected");
  } catch (err) {
    // The token endpoint's own message (redirect_uri_mismatch, invalid_client,
    // invalid_grant, access_denied, …) is what tells the user which console
    // setting is wrong. Log it in full; pass a short code to the UI.
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[photos/callback] token exchange failed:", message);
    return back(`photos=error&reason=${encodeURIComponent(message.slice(0, 140))}`);
  }
}
