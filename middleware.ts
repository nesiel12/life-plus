import { NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";
import type { NextRequestWithAuth } from "next-auth/middleware";
import type { NextFetchEvent } from "next/server";
import { sessionCookieConfig } from "@/lib/sessionCookie";

// The canonical host every part of the OAuth dance must run on.
//
// NextAuth builds the redirect_uri it sends to Google from NEXTAUTH_URL,
// unconditionally, once it's set (next-auth/utils/detect-origin.js). That
// part is always correct regardless of which hostname a request physically
// arrived on. The state/PKCE cookies it sets during /api/auth/signin/google
// are a different mechanism entirely: a plain Set-Cookie with no Domain
// attribute, scoped by the browser to the exact host that issued it.
//
// Vercel gives every deployment its own permanent, unique hostname
// (<project>-<hash>-<team>.vercel.app) in addition to whichever domain is
// currently aliased to "Production". Both serve the identical deployment.
// If a visitor reaches /login or clicks sign-in while on the per-deployment
// URL, the state cookie is scoped there — then Google, honoring the
// NEXTAUTH_URL-derived redirect_uri, sends them back to the *other*
// hostname, which never receives that cookie. NextAuth throws "state
// mismatch" on every single attempt, because the two hostnames it's
// straddling are exactly what the OAuth state check exists to catch.
//
// Fails open on a malformed NEXTAUTH_URL: skipping the redirect reverts to
// today's known bug, which is far safer than throwing on every request in
// production over one bad env var.
function canonicalHost(): string | null {
  try {
    return process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).host : null;
  } catch {
    return null;
  }
}

// Gated on VERCEL_ENV, not NODE_ENV: a Preview deployment also builds with
// NODE_ENV=production, and its own unique preview URL is supposed to work
// unredirected — canonicalizing it to the Production domain would break
// preview review links, not fix anything.
const shouldCanonicalize = process.env.VERCEL_ENV === "production";

const authMiddleware = withAuth({
  pages: {
    signIn: "/login",
  },
  // Must match lib/auth.ts's authOptions.cookies exactly, or withAuth's
  // getToken() looks for a cookie name the sign-in route never wrote — see
  // lib/sessionCookie.ts for the mechanism this fixes.
  cookies: sessionCookieConfig,
});

// Paths that require a signed-in session — unchanged from before. /login and
// /api/auth/:path* deliberately stay outside this set: they need the host
// canonicalized (below), never the sign-in gate itself.
const PROTECTED = [
  /^\/$/,
  /^\/timeline(\/|$)/,
  /^\/areas(\/|$)/,
  /^\/calendar(\/|$)/,
  /^\/settings(\/|$)/,
];

export default function middleware(req: NextRequestWithAuth, event: NextFetchEvent) {
  if (shouldCanonicalize) {
    const host = canonicalHost();
    if (host && req.nextUrl.host !== host) {
      const url = req.nextUrl.clone();
      url.host = host;
      url.protocol = "https";
      // 308: the method and body (irrelevant here, everything covered is
      // GET) are preserved, and it signals this redirect is permanent — the
      // temporary deployment URL never legitimately serves this app.
      return NextResponse.redirect(url, 308);
    }
  }

  if (PROTECTED.some((re) => re.test(req.nextUrl.pathname))) {
    return authMiddleware(req, event);
  }

  return NextResponse.next();
}

export const config = {
  // Widened to include /login and /api/auth/:path* — the two paths the
  // actual bug runs through — alongside the pages that already required a
  // session. Everything in PROTECTED above is a subset of this list.
  matcher: [
    "/",
    "/login",
    "/api/auth/:path*",
    "/timeline/:path*",
    "/areas/:path*",
    "/calendar/:path*",
    "/settings/:path*",
  ],
};
