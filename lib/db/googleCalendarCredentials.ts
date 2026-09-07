import "server-only";
import { getSupabaseClient } from "@/lib/supabase";

// The user's Google Calendar grant, stored server-side.
//
// NextAuth already keeps these tokens on the JWT cookie (lib/auth.ts), which
// is the right place for anything a signed-in browser does. It is the wrong
// place — the only place — for the Proactive Engine: a job running at 07:00
// has no request, no cookie, and therefore no token. Without this table
// morning_briefing cannot see the user's calendar, which is most of what a
// morning briefing is.
//
// Same shape and same trust boundary as google_photos_credentials
// (lib/db/googlePhotos.ts): reachable only via the service-role key, which is
// server-only.

export interface StoredCalendarCredentials {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
  scope: string;
  /** Set when a refresh failed permanently — the user must reconnect. */
  invalidAt: string | null;
}

export const googleCalendarCredentialsRepo = {
  async get(userId: string): Promise<StoredCalendarCredentials | null> {
    const { data, error } = await getSupabaseClient()
      .from("google_calendar_credentials")
      .select("access_token, refresh_token, expires_at, scope, invalid_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at,
      scope: data.scope,
      invalidAt: data.invalid_at,
    };
  },

  async upsert(
    userId: string,
    creds: { accessToken: string; refreshToken?: string | null; expiresAt: string; scope: string }
  ): Promise<void> {
    // Google omits refresh_token on re-consent unless prompt=consent was
    // sent. Never overwrite a stored one with null, or the grant silently
    // becomes un-refreshable and dies at the next access-token expiry — the
    // exact failure lib/db/googlePhotos.ts documents.
    const existing = await googleCalendarCredentialsRepo.get(userId);
    const refreshToken = creds.refreshToken ?? existing?.refreshToken ?? null;

    const { error } = await getSupabaseClient()
      .from("google_calendar_credentials")
      .upsert(
        {
          user_id: userId,
          access_token: creds.accessToken,
          refresh_token: refreshToken,
          expires_at: creds.expiresAt,
          scope: creds.scope,
          // A successful write clears any previous "reconnect required" mark:
          // this *is* the reconnection.
          invalid_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (error) throw new Error(error.message);
  },

  /** Marks the grant unusable so jobs stop retrying it every run. */
  async markInvalid(userId: string): Promise<void> {
    const { error } = await getSupabaseClient()
      .from("google_calendar_credentials")
      .update({ invalid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  },
};
