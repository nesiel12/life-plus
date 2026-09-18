// What the lessons uploader accepts — shared by the browser (to refuse a file
// before uploading 50 MB of it) and the API (to refuse it for real).

import { youtubeVideoId } from "@/lib/learning/youtube";

/** Supabase free-plan per-object ceiling, and the bucket's limit (20260918000000). */
export const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

/** Longest media the pipeline will take on: a very long shiur, not a day-long stream. */
export const MAX_MEDIA_SECONDS = 4 * 60 * 60;

const EXTENSION_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  webm: "audio/webm",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  flac: "audio/flac",
};

/** The accept attribute for the file input. */
export const AUDIO_ACCEPT = ["audio/*", ...Object.keys(EXTENSION_MIME).map((ext) => `.${ext}`)].join(",");

/**
 * A canonical audio MIME type for a file, or null when it is not audio.
 *
 * Browsers disagree about audio types — Safari reports m4a as "audio/x-m4a",
 * Windows sometimes reports nothing at all — so the extension is the tie-breaker.
 * Gemini and the storage bucket both need a type they recognise.
 */
export function audioMimeType(type: string | null | undefined, fileName: string): string | null {
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  const byExtension = EXTENSION_MIME[extension];
  const clean = (type ?? "").toLowerCase().split(";")[0].trim();

  if (clean === "audio/x-m4a" || clean === "audio/m4a") return "audio/mp4";
  if (clean === "audio/mp3") return "audio/mpeg";
  if (clean === "audio/x-wav") return "audio/wav";
  if (clean === "audio/x-flac") return "audio/flac";
  if (clean.startsWith("audio/") && Object.values(EXTENSION_MIME).includes(clean)) return clean;
  // "video/mp4" for an .m4a, or no type at all: trust a known audio extension.
  return byExtension ?? null;
}

/** A storage-safe object name: ASCII, no path separators, extension kept. */
export function storageFileName(fileName: string): string {
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  const safeExtension = EXTENSION_MIME[extension] ? extension : "audio";
  return `lesson.${safeExtension}`;
}

/** A YouTube watch URL in the one canonical form Gemini accepts, or null. */
export function canonicalYoutubeUrl(input: string): string | null {
  const id = youtubeVideoId(input);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}
