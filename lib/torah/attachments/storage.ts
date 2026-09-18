import "server-only";

import { getSupabaseClient } from "@/lib/supabase";
import { LESSON_MEDIA_BUCKET } from "@/lib/torah/lessons/storage";

// Storage for universal audio attachments and handwriting scans.
//
// Audio reuses the private lesson-media bucket (20260918000000): the same
// privacy model, the same 50 MB ceiling and the same audio-only mime whitelist
// already apply, and a second audio bucket would be a second set of rules to
// keep in step for nothing. Paths are `<userId>/attachments/<id>/audio.<ext>`,
// so ownership is legible in the object key itself.
//
// Scans get their own bucket, precisely because its whitelist is images: a
// bucket that accepts both audio and images accepts anything with a renamed
// extension.

export const TORAH_SCANS_BUCKET = "torah-scans";

const PLAYBACK_URL_SECONDS = 6 * 60 * 60;
const SCAN_URL_SECONDS = 60 * 60;

function audioBucket() {
  return getSupabaseClient().storage.from(LESSON_MEDIA_BUCKET);
}

function scansBucket() {
  return getSupabaseClient().storage.from(TORAH_SCANS_BUCKET);
}

/** A one-time upload URL for the browser — the file never passes through a function. */
export async function createAttachmentUploadUrl(path: string): Promise<{ signedUrl: string; token: string }> {
  const { data, error } = await audioBucket().createSignedUploadUrl(path, { upsert: true });
  if (error || !data) throw error ?? new Error("Could not create an upload URL");
  return { signedUrl: data.signedUrl, token: data.token };
}

/** The uploaded object's size, or null when nothing is there yet. */
export async function attachmentSize(path: string): Promise<number | null> {
  const { data, error } = await audioBucket().info(path);
  if (error || !data) return null;
  const size = (data as { size?: number | null }).size;
  return typeof size === "number" ? size : 0;
}

export async function attachmentPlaybackUrl(path: string): Promise<string | null> {
  const { data, error } = await audioBucket().createSignedUrl(path, PLAYBACK_URL_SECONDS);
  return error || !data ? null : data.signedUrl;
}

export async function downloadAttachment(path: string): Promise<Uint8Array> {
  const { data, error } = await audioBucket().download(path);
  if (error || !data) throw error ?? new Error("Attachment audio not found");
  return new Uint8Array(await data.arrayBuffer());
}

export async function removeAttachment(path: string): Promise<void> {
  await audioBucket().remove([path]);
}

// ---------------------------------------------------------------------------
// Handwriting scans
// ---------------------------------------------------------------------------

export function scanImagePath(userId: string, scanId: string, index: number): string {
  return `${userId}/${scanId}/page-${index + 1}.jpg`;
}

/**
 * Uploads a normalised page image.
 *
 * Server-side rather than through a signed URL, unlike audio: the image has
 * already passed through sharp in the route (EXIF stripped, HEIC converted,
 * bounded) and is at most a couple of megabytes by then — the round trip the
 * signed-URL dance saves is not worth a second upload step here.
 */
export async function uploadScanImage(path: string, bytes: Uint8Array): Promise<void> {
  const { error } = await scansBucket().upload(path, bytes, { contentType: "image/jpeg", upsert: true });
  if (error) throw error;
}

export async function scanImageUrl(path: string): Promise<string | null> {
  const { data, error } = await scansBucket().createSignedUrl(path, SCAN_URL_SECONDS);
  return error || !data ? null : data.signedUrl;
}

export async function removeScanImages(paths: string[]): Promise<void> {
  if (paths.length > 0) await scansBucket().remove(paths);
}
