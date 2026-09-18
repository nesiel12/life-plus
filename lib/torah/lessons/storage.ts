import "server-only";

import { getSupabaseClient } from "@/lib/supabase";
import { storageFileName } from "@/lib/torah/lessons/media";

// The private "lesson-media" bucket (20260918000000_torah_lessons_phase3.sql).
//
// The browser never gets the service key and never sees another user's path:
// uploads go through a one-time signed upload URL issued after the API's own
// checks, and playback through a short-lived signed read URL. Paths are
// `<userId>/<lessonId>/lesson.<ext>`, so ownership is legible in the object
// key itself.

export const LESSON_MEDIA_BUCKET = "lesson-media";

// Long enough for a lesson page left open through a whole shiur.
const PLAYBACK_URL_SECONDS = 6 * 60 * 60;

function bucket() {
  return getSupabaseClient().storage.from(LESSON_MEDIA_BUCKET);
}

export function lessonMediaPath(userId: string, lessonId: string, fileName: string): string {
  return `${userId}/${lessonId}/${storageFileName(fileName)}`;
}

/** A one-time upload URL for the browser (valid two hours). */
export async function createLessonUploadUrl(path: string): Promise<{ signedUrl: string; token: string }> {
  const { data, error } = await bucket().createSignedUploadUrl(path, { upsert: true });
  if (error || !data) throw error ?? new Error("Could not create an upload URL");
  return { signedUrl: data.signedUrl, token: data.token };
}

/** The uploaded object's size, or null when nothing is there yet. */
export async function lessonMediaSize(path: string): Promise<number | null> {
  const { data, error } = await bucket().info(path);
  if (error || !data) return null;
  const size = (data as { size?: number | null }).size;
  return typeof size === "number" ? size : 0;
}

export async function lessonPlaybackUrl(path: string): Promise<string | null> {
  const { data, error } = await bucket().createSignedUrl(path, PLAYBACK_URL_SECONDS);
  return error || !data ? null : data.signedUrl;
}

export async function downloadLessonMedia(path: string): Promise<Uint8Array> {
  const { data, error } = await bucket().download(path);
  if (error || !data) throw error ?? new Error("Lesson media not found");
  return new Uint8Array(await data.arrayBuffer());
}

export async function removeLessonMedia(path: string): Promise<void> {
  await bucket().remove([path]);
}
