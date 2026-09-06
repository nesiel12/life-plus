import "server-only";
import { appBaseUrl } from "@/lib/appUrl";
import { googlePhotosCredentialsRepo } from "@/lib/db/googlePhotos";
import { PICKER_SCOPE } from "@/lib/photos/pickerClient";

// Incremental authorization for Google Photos, deliberately separate from
// sign-in. Adding a sensitive Photos scope to lib/auth.ts's GOOGLE_SCOPES would
// force every user to re-consent merely to log in, and would pull the whole app
// into a heavier OAuth verification posture. Here it is an opt-in grant with
// its own token row, revocable without touching sign-in.

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

/** Refresh this many ms before actual expiry, so a call mid-flight can't 401. */
const EXPIRY_SKEW_MS = 60_000;

export function photosRedirectUri(): string {
  return `${appBaseUrl()}/api/photos/callback`;
}

export function buildConsentUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: photosRedirectUri(),
    response_type: "code",
    scope: PICKER_SCOPE,
    access_type: "offline",
    // Without this Google omits refresh_token on any re-consent, leaving a
    // connection that dies at the first access-token expiry.
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const data = (await res.json()) as TokenResponse;
  if (!res.ok || data.error) {
    throw new Error(data.error_description ?? data.error ?? "Google token exchange failed.");
  }
  return data;
}

export async function exchangeCodeForTokens(userId: string, code: string): Promise<void> {
  const tokens = await tokenRequest({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirect_uri: photosRedirectUri(),
    grant_type: "authorization_code",
  });

  await googlePhotosCredentialsRepo.upsert(userId, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    scope: tokens.scope,
  });
}

export class PhotosNotConnectedError extends Error {
  constructor() {
    super("Google Photos is not connected.");
    this.name = "PhotosNotConnectedError";
  }
}

/**
 * A currently-valid access token, refreshing transparently when needed.
 * Throws PhotosNotConnectedError when there is no usable credential, so callers
 * can return a 409 and prompt the user to connect rather than a generic 500.
 */
export async function getPhotosAccessToken(userId: string): Promise<string> {
  const creds = await googlePhotosCredentialsRepo.get(userId);
  if (!creds) throw new PhotosNotConnectedError();

  const expiresAt = new Date(creds.expiresAt).getTime();
  if (Number.isFinite(expiresAt) && expiresAt - EXPIRY_SKEW_MS > Date.now()) {
    return creds.accessToken;
  }

  if (!creds.refreshToken) {
    // Expired with no way to refresh — the connection is dead. Clear it so the
    // UI shows "connect" rather than repeatedly failing against a stale token.
    await googlePhotosCredentialsRepo.disconnect(userId);
    throw new PhotosNotConnectedError();
  }

  const refreshed = await tokenRequest({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    refresh_token: creds.refreshToken,
    grant_type: "refresh_token",
  });

  await googlePhotosCredentialsRepo.upsert(userId, {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? creds.refreshToken,
    expiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    scope: refreshed.scope ?? creds.scope,
  });

  return refreshed.access_token;
}
