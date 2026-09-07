import "server-only";
import { googleCalendarCredentialsRepo } from "@/lib/db/googleCalendarCredentials";

// Getting a usable Google Calendar access token for a user with no request in
// hand — the Proactive Engine's equivalent of what lib/auth.ts's `jwt`
// callback does for a signed-in browser.
//
// Deliberately a separate refresh implementation from the one in lib/auth.ts:
// that one refreshes a JWT and returns a JWT, and is called inside NextAuth's
// callback chain. This one refreshes a database row. Merging them would mean
// one function that sometimes has a request and sometimes doesn't.

interface GoogleRefreshResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

/** Refresh a minute early, so a token doesn't expire mid-request. */
const EXPIRY_SKEW_MS = 60_000;

/**
 * A valid access token for this user, refreshing the stored grant if needed.
 *
 * Returns null — never throws — for every "this user just isn't connected"
 * case: no stored grant, a grant already marked invalid, or a refresh Google
 * refuses. A per-user job iterating hundreds of users must treat one
 * disconnected account as a skip, not as a failed run.
 */
export async function getCalendarAccessTokenForUser(userId: string): Promise<string | null> {
  let creds;
  try {
    creds = await googleCalendarCredentialsRepo.get(userId);
  } catch {
    return null;
  }

  if (!creds || creds.invalidAt) return null;

  const expiresAt = new Date(creds.expiresAt).getTime();
  if (Number.isFinite(expiresAt) && expiresAt - EXPIRY_SKEW_MS > Date.now()) {
    return creds.accessToken;
  }

  if (!creds.refreshToken) {
    // Expired with no way to renew. Mark it so later runs skip immediately
    // instead of re-deriving this same conclusion every time.
    await googleCalendarCredentialsRepo.markInvalid(userId).catch(() => {});
    return null;
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        grant_type: "refresh_token",
        refresh_token: creds.refreshToken,
      }),
    });

    const refreshed = (await response.json()) as GoogleRefreshResponse & { error?: string };

    if (!response.ok || !refreshed.access_token) {
      // `invalid_grant` is Google's "this refresh token is dead" — revoked
      // access, a password change, or six months of disuse. Anything else
      // (a 5xx, a network blip) might well work next run, so only the
      // permanent case marks the row.
      if (refreshed.error === "invalid_grant") {
        await googleCalendarCredentialsRepo.markInvalid(userId).catch(() => {});
      }
      return null;
    }

    await googleCalendarCredentialsRepo.upsert(userId, {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? creds.refreshToken,
      expiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      scope: refreshed.scope ?? creds.scope,
    });

    return refreshed.access_token;
  } catch {
    return null;
  }
}
