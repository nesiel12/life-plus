import type { NextAuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";
import GoogleProvider from "next-auth/providers/google";
import { getOrCreateUserByEmail } from "@/lib/db/users";
import { lifeAreaScoresRepo } from "@/lib/db/lifeAreaScores";
import { personalDnaRepo } from "@/lib/db/personalDna";
import { notificationPreferencesRepo } from "@/lib/db/notificationPreferences";
import { googleCalendarCredentialsRepo } from "@/lib/db/googleCalendarCredentials";
import { sessionCookieConfig } from "@/lib/sessionCookie";

// calendar.events (not calendar.readonly) — accepting a schedule suggestion
// now creates a real event via the Calendar API (see app/api/calendar/events),
// which needs write access; calendar.events also covers the freeBusy reads
// calendar.readonly used to provide. gmail.readonly was requested but never
// used by any feature — dropped per docs/BACKLOG.md (an unused scope is a
// trust and OAuth-verification liability with nothing behind it).
//
// calendar.calendarlist.readonly is the narrowest scope that permits
// calendarList.list, which is what lets the app see calendars *other than*
// primary — a second work or family calendar was previously invisible in
// every view. It grants no access to event contents beyond what
// calendar.events already allows; it only enumerates which calendars exist.
// lib/googleCalendar/fetchWindow.ts degrades to primary-only when this scope
// is absent, so a session granted under the old list keeps working until the
// user next signs in and re-consents.
const GOOGLE_SCOPES = [
  "openid",
  "profile",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
].join(" ");

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
  // Pinned by NODE_ENV, not derived from NEXTAUTH_URL — see
  // lib/sessionCookie.ts for why the two disagree and what that breaks.
  cookies: sessionCookieConfig,
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    // Open sign-up: any Google account may authenticate. The former
    // ALLOWED_SIGNIN_EMAILS allow-list is gone, along with its fail-closed
    // behaviour on an empty value.
    //
    // An email is still required, and that is not a residue of the
    // allow-list — it is the tenancy key. getCurrentUser() resolves the
    // users row from session.user.email, and getOrCreateUserByEmail keys on
    // it too, so a session without one cannot be scoped to any data and
    // would fail on the first Server Action it reached. Rejecting here turns
    // that into a clean "cannot sign in" instead of a broken session.
    async signIn({ user }) {
      return Boolean(user.email);
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
    async signIn({ user, account }) {
      if (!user.email) return;
      const dbUser = await getOrCreateUserByEmail(user.email, {
        name: user.name ?? user.email,
        image: user.image,
      });
      await Promise.all([
        lifeAreaScoresRepo.ensureDefaultsForUser(dbUser.id),
        personalDnaRepo.upsert(dbUser.id, {}),
        notificationPreferencesRepo.upsert(dbUser.id, {}),
      ]);

      // Persist the Google grant so the Proactive Engine can read the user's
      // calendar with nobody signed in. The JWT copy above serves requests
      // made by a browser; a 07:00 cron job has neither browser nor cookie,
      // and a morning briefing that cannot see today's meetings is not a
      // briefing. See lib/googleCalendar/serverAccess.ts for the read path.
      //
      // Failure here must not block sign-in: the user still gets a working
      // session, they just don't get proactive calendar-aware notifications
      // until a later sign-in stores the grant successfully.
      if (account?.access_token && account.expires_at) {
        try {
          await googleCalendarCredentialsRepo.upsert(dbUser.id, {
            accessToken: account.access_token,
            refreshToken: account.refresh_token ?? null,
            expiresAt: new Date(account.expires_at * 1000).toISOString(),
            scope: account.scope ?? GOOGLE_SCOPES,
          });
        } catch (err) {
          console.error("[auth] Failed to store Google Calendar credentials:", err);
        }
      }
    },
  },
};
