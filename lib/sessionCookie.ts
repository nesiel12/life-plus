// The NextAuth v4 session cookie's name and Secure flag, pinned in one place.
//
// Why this exists: NextAuth decides these two things differently depending
// on which code path is running.
//
//   - The route handler that SETS the cookie (app/api/auth/[...nextauth])
//     infers "am I on https?" from the actual incoming request's detected
//     host — correct on Vercel regardless of any env var.
//   - middleware.ts's withAuth READS the cookie via next-auth/jwt's
//     getToken(), which infers the same thing from process.env.NEXTAUTH_URL
//     alone (falling back to the VERCEL env var only when NEXTAUTH_URL is
//     completely unset — see next-auth/jwt/index.js).
//
// If NEXTAUTH_URL is ever set to a non-https value in a production
// environment (e.g. a stray http://localhost:3000 copied from .env.local),
// those two paths disagree on the cookie's name:
// __Secure-next-auth.session-token gets set, but getToken() goes looking
// for next-auth.session-token and never finds it. The user signs in
// successfully, middleware treats them as signed out, and they bounce back
// to /login — forever, with no error visible anywhere.
//
// Deciding this from NODE_ENV rather than NEXTAUTH_URL closes that gap for
// good: NODE_ENV is set by the platform, never hand-configured, and Vercel
// always serves production over HTTPS. Both authOptions.cookies (in
// lib/auth.ts) and middleware.ts's withAuth import this so there is exactly
// one place either could ever drift.
//
// No imports: middleware.ts runs on the Edge runtime by default, and
// lib/auth.ts pulls in server-only database modules that an Edge bundle
// cannot include. This file has to stay dependency-free so both can import
// it safely.
const useSecureCookies = process.env.NODE_ENV === "production";

export const sessionCookieConfig = {
  sessionToken: {
    name: `${useSecureCookies ? "__Secure-" : ""}next-auth.session-token`,
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      path: "/",
      secure: useSecureCookies,
    },
  },
};
