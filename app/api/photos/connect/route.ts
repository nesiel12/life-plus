import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import { buildConsentUrl } from "@/lib/photos/auth";

// Starts the Google Photos incremental-auth flow. Separate from sign-in on
// purpose — see lib/photos/auth.ts.
export const runtime = "nodejs";

const STATE_COOKIE = "lifeplus.photos.oauth_state";
const RETURN_COOKIE = "lifeplus.photos.oauth_return";

/** Only ever a same-origin app path — never an absolute URL from the query. */
function safeReturnPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // CSRF: the callback must prove it is answering the request we started.
  const state = randomBytes(32).toString("hex");
  // Where to land after consent — the page the user started from, so a
  // connect from the dashboard doesn't dump them on /areas/family.
  const returnTo = safeReturnPath(
    request.nextUrl.searchParams.get("return") ??
      (() => {
        try {
          const ref = request.headers.get("referer");
          return ref ? new URL(ref).pathname + new URL(ref).search : null;
        } catch {
          return null;
        }
      })()
  );

  const jar = await cookies();
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 600,
    path: "/",
  };
  jar.set(STATE_COOKIE, state, cookieOpts);
  jar.set(RETURN_COOKIE, returnTo, cookieOpts);

  return NextResponse.redirect(buildConsentUrl(state));
}
