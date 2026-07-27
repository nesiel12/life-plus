import type { NextAuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";
import GoogleProvider from "next-auth/providers/google";
import { getOrCreateUserByEmail } from "@/lib/db/users";
import { lifeAreaScoresRepo } from "@/lib/db/lifeAreaScores";
import { personalDnaRepo } from "@/lib/db/personalDna";

// calendar.events (not calendar.readonly) — accepting a schedule suggestion
// now creates a real event via the Calendar API (see app/api/calendar/events),
// which needs write access; calendar.events also covers the freeBusy reads
// calendar.readonly used to provide. gmail.readonly was requested but never
// used by any feature — dropped per docs/BACKLOG.md (an unused scope is a
// trust and OAuth-verification liability with nothing behind it). Anyone
// already signed in under the old scopes will be re-prompted to consent on
// next sign-in.
const GOOGLE_SCOPES = [
  "openid",
  "profile",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

// Fail closed: until real multi-tenancy exists (see docs/ROADMAP_V2.md Phase 1/6),
// only explicitly allow-listed emails may authenticate. An unset or empty
// ALLOWED_SIGNIN_EMAILS locks sign-in out entirely rather than opening it to anyone
// with a Google account.
const ALLOWED_SIGNIN_EMAILS = new Set(
  (process.env.ALLOWED_SIGNIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

interface GoogleRefreshResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

// Google access tokens expire (~1hr). Without this, calendar suggestions
// would silently stop working an hour after sign-in until the user logged
// back in (see docs/BACKLOG.md High Priority). Standard NextAuth refresh
// pattern: https://next-auth.js.org/v3/tutorials/refresh-token-rotation
async function refreshGoogleAccessToken(token: JWT): Promise<JWT> {
  try {
    if (!token.refreshToken) throw new Error("No refresh token available");

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
    });

    const refreshed = (await response.json()) as GoogleRefreshResponse;
    if (!response.ok) throw refreshed;

    return {
      ...token,
      accessToken: refreshed.access_token,
      accessTokenExpires: Date.now() + refreshed.expires_in * 1000,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      error: undefined,
    };
  } catch {
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          scope: GOOGLE_SCOPES,
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      return ALLOWED_SIGNIN_EMAILS.has(user.email.toLowerCase());
    },
    async jwt({ token, account }) {
      // Initial sign-in: Google just issued fresh tokens. Explicitly
      // clears any `error` left over from a previous failed refresh —
      // without this, a stale RefreshAccessTokenError survived a brand
      // new, successful sign-in (the `...token` spread doesn't touch
      // `error`), which made every /api/calendar/* route treat a freshly
      // reconnected session as still disconnected until the new token
      // itself expired ~an hour later. This was the actual "Connect
      // Google Calendar loops back but still says not connected" bug —
      // not a missing scope.
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          accessTokenExpires: account.expires_at ? account.expires_at * 1000 : undefined,
          error: undefined,
        };
      }

      if (token.accessTokenExpires && Date.now() < token.accessTokenExpires) {
        return token;
      }

      return refreshGoogleAccessToken(token);
    },
    // Deliberately does NOT put accessToken/refreshToken on the session —
    // those scopes (calendar.readonly, gmail.readonly) must never reach
    // client JS. Server code that needs the token reads it directly off the
    // JWT via next-auth/jwt's getToken() (see app/api/calendar/suggestions).
    async session({ session, token }) {
      if (token.error) {
        session.error = token.error;
      }
      return session;
    },
  },
  events: {
    // Runs after a sign-in the `signIn` callback already approved. Ensures a
    // `users` row (and its dependent per-user rows) exists before any page
    // tries to read/write data for this identity.
    async signIn({ user }) {
      if (!user.email) return;
      const dbUser = await getOrCreateUserByEmail(user.email, {
        name: user.name ?? user.email,
        image: user.image,
      });
      await Promise.all([
        lifeAreaScoresRepo.ensureDefaultsForUser(dbUser.id),
        personalDnaRepo.upsert(dbUser.id, {}),
      ]);
    },
  },
};
