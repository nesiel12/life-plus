import "server-only";
import { getSupabaseClient } from "@/lib/supabase";
import { PICKER_SCOPE } from "@/lib/photos/pickerClient";

// Google Photos state: the incremental-auth credential, picker sessions, and
// the stored photo corpus. These tables don't fit createUserScopedRepo (one is
// keyed by user_id alone, one by a Google-issued string id, and photo_memories
// carries bytea that must never be selected by accident), so they get their own
// module — the same carve-out lib/db/createUserScopedRepo.ts documents.

interface StoredCredentials {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
  scope: string;
}

export const googlePhotosCredentialsRepo = {
  async get(userId: string): Promise<StoredCredentials | null> {
    const { data, error } = await getSupabaseClient()
      .from("google_photos_credentials")
      .select("access_token, refresh_token, expires_at, scope")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at,
      scope: data.scope,
    };
  },

  async upsert(
    userId: string,
    creds: { accessToken: string; refreshToken?: string | null; expiresAt: string; scope?: string }
  ): Promise<void> {
    // Google omits refresh_token on re-consent unless prompt=consent was sent.
    // Never overwrite a stored one with null, or the connection silently
    // becomes un-refreshable and dies at the next access-token expiry.
    const existing = await googlePhotosCredentialsRepo.get(userId);
    const refreshToken = creds.refreshToken ?? existing?.refreshToken ?? null;

    const { error } = await getSupabaseClient()
      .from("google_photos_credentials")
      .upsert(
        {
          user_id: userId,
          access_token: creds.accessToken,
          refresh_token: refreshToken,
          expires_at: creds.expiresAt,
          scope: creds.scope ?? PICKER_SCOPE,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (error) throw new Error(error.message);
  },

  async disconnect(userId: string): Promise<void> {
    const { error } = await getSupabaseClient()
      .from("google_photos_credentials")
      .delete()
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  },
};

export const pickerSessionsRepo = {
  async create(row: {
    id: string;
    userId: string;
    purpose: "memories" | "avatar";
    targetPersonId?: string | null;
    pickerUri: string;
    expireTime?: string | null;
  }): Promise<void> {
    const { error } = await getSupabaseClient().from("google_photos_picker_sessions").insert({
      id: row.id,
      user_id: row.userId,
      purpose: row.purpose,
      target_person_id: row.targetPersonId ?? null,
      picker_uri: row.pickerUri,
      expire_time: row.expireTime ?? null,
    });
    if (error) throw new Error(error.message);
  },

  async get(userId: string, sessionId: string) {
    const { data, error } = await getSupabaseClient()
      .from("google_photos_picker_sessions")
      .select("id, purpose, target_person_id, picker_uri, expire_time, media_items_set")
      .eq("user_id", userId)
      .eq("id", sessionId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },

  async markItemsSet(userId: string, sessionId: string): Promise<void> {
    const { error } = await getSupabaseClient()
      .from("google_photos_picker_sessions")
      .update({ media_items_set: true })
      .eq("user_id", userId)
      .eq("id", sessionId);
    if (error) throw new Error(error.message);
  },

  async remove(userId: string, sessionId: string): Promise<void> {
    const { error } = await getSupabaseClient()
      .from("google_photos_picker_sessions")
      .delete()
      .eq("user_id", userId)
      .eq("id", sessionId);
    if (error) throw new Error(error.message);
  },
};

export interface PhotoMemoryMeta {
  id: string;
  takenAt: string;
  width: number;
  height: number;
  caption: string | null;
  source: string;
}

export const photoMemoriesRepo = {
  /**
   * Metadata only — image_data is deliberately never in this select. A bytea
   * column pulled into a list query would move megabytes per request for data
   * the caller doesn't render inline; bytes are streamed by their own route.
   */
  async listMeta(userId: string, limit = 500): Promise<PhotoMemoryMeta[]> {
    const { data, error } = await getSupabaseClient()
      .from("photo_memories")
      .select("id, taken_at, width, height, caption, source")
      .eq("user_id", userId)
      .order("taken_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => ({
      id: row.id,
      takenAt: row.taken_at,
      width: row.width,
      height: row.height,
      caption: row.caption,
      source: row.source,
    }));
  },

  async getImage(
    userId: string,
    id: string
  ): Promise<{ data: Buffer; mimeType: string } | null> {
    const { data, error } = await getSupabaseClient()
      .from("photo_memories")
      .select("image_data, mime_type")
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data?.image_data) return null;

    // supabase-js returns bytea as a "\x…" hex string over PostgREST.
    const raw: string = data.image_data;
    const buffer = raw.startsWith("\\x")
      ? Buffer.from(raw.slice(2), "hex")
      : Buffer.from(raw, "base64");

    return { data: buffer, mimeType: data.mime_type };
  },

  async insert(row: {
    userId: string;
    takenAt: string;
    googleMediaId?: string | null;
    source: "picker" | "takeout" | "upload";
    imageData: Buffer;
    mimeType: string;
    width: number;
    height: number;
    byteSize: number;
  }): Promise<void> {
    const { error } = await getSupabaseClient()
      .from("photo_memories")
      .upsert(
        {
          user_id: row.userId,
          taken_at: row.takenAt,
          google_media_id: row.googleMediaId ?? null,
          source: row.source,
          image_data: `\\x${row.imageData.toString("hex")}`,
          mime_type: row.mimeType,
          width: row.width,
          height: row.height,
          byte_size: row.byteSize,
        },
        { onConflict: "user_id,google_media_id", ignoreDuplicates: true }
      );

    if (error) throw new Error(error.message);
  },

  async setCaption(userId: string, id: string, caption: string): Promise<void> {
    const { error } = await getSupabaseClient()
      .from("photo_memories")
      .update({ caption, caption_generated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", id);
    if (error) throw new Error(error.message);
  },
};
