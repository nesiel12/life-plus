// Universal audio attachments — the shapes the API returns, and every pure
// decision around them.
//
// Client-safe: the widget, the API routes and the worker all read these, so
// naming an attachment, deciding whether it may be transcribed, and reporting
// progress are answered the same way on both sides of the wire.

import { parseStoredLines, type TranscriptLine } from "@/lib/torah/lessons/transcript";
import type {
  AudioAttachmentSourceDb,
  AudioAttachmentStatusDb,
  AudioEntityTypeDb,
  Database,
} from "@/types/database";

export type AudioEntityType = AudioEntityTypeDb;
export type AudioAttachmentStatus = AudioAttachmentStatusDb;
export type AudioAttachmentSource = AudioAttachmentSourceDb;

type AudioRow = Database["public"]["Tables"]["entity_audio"]["Row"];

/** Singular Hebrew, for "הקלטה על ה<כאן>". */
export const AUDIO_ENTITY_LABELS: Record<AudioEntityType, string> = {
  book: "ספר",
  rabbi: "רב",
  lesson: "שיעור",
  concept: "מושג",
  summary: "סיכום",
};

export const ATTACHMENT_STATUS_LABELS: Record<AudioAttachmentStatus, string> = {
  uploading: "בהעלאה",
  stored: "שמור",
  transcribing: "מתמלל",
  ready: "תומלל",
  failed: "התמלול נכשל",
};

/** The worker's cursor, stored in `progress`. */
export interface AudioTranscriptionProgress {
  phase?: "plan" | "transcribe";
  windows?: { start: number; end: number }[];
  nextWindow?: number;
  geminiFile?: { name: string; uri: string; mimeType: string; expiresAt?: string };
  /** True when the windows were planned from a size estimate, not real metadata. */
  estimatedDuration?: boolean;
  emptyWindows?: number;
  pausedUntil?: string;
  pauseReason?: string;
  lastError?: string;
}

export interface AudioProgressView {
  /** 0..1 across the planned windows. */
  fraction: number;
  windowsDone: number;
  windowsTotal: number;
  pausedUntil?: string;
  pauseReason?: string;
}

export interface AudioAttachmentView {
  id: string;
  entityType: AudioEntityType;
  entityId: string;
  title: string;
  status: AudioAttachmentStatus;
  source: AudioAttachmentSource;
  mime: string;
  sizeBytes: number | null;
  durationSeconds: number | null;
  /** A signed playback URL, when one was requested. */
  mediaUrl: string | null;
  transcript: string | null;
  transcriptLines: TranscriptLine[];
  transcriptProvider: string | null;
  error: string | null;
  progress: AudioProgressView;
  createdAt: string;
}

export function readAudioProgress(value: unknown): AudioTranscriptionProgress {
  return value && typeof value === "object" ? (value as AudioTranscriptionProgress) : {};
}

/**
 * How far the transcription has got.
 *
 * Reported from windows finished, not time elapsed: a window is the unit the
 * worker actually commits, so this only ever moves forward and never claims
 * progress that would be lost if the worker died.
 */
export function audioProgressView(row: Pick<AudioRow, "status" | "progress">): AudioProgressView {
  const progress = readAudioProgress(row.progress);
  const windowsTotal = progress.windows?.length ?? 0;
  const windowsDone = Math.min(progress.nextWindow ?? 0, windowsTotal);
  const fraction =
    row.status === "ready" ? 1 : windowsTotal > 0 ? Math.min(0.99, windowsDone / windowsTotal) : row.status === "transcribing" ? 0.02 : 0;

  return {
    fraction: Math.round(fraction * 100) / 100,
    windowsDone,
    windowsTotal,
    pausedUntil: progress.pausedUntil,
    pauseReason: progress.pauseReason,
  };
}

export function toAttachmentView(row: AudioRow, mediaUrl: string | null = null): AudioAttachmentView {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    title: row.title,
    status: row.status,
    source: row.source,
    mime: row.mime,
    sizeBytes: row.size_bytes,
    durationSeconds: row.duration_seconds,
    mediaUrl,
    transcript: row.transcript,
    transcriptLines: parseStoredLines(row.transcript_lines),
    transcriptProvider: row.transcript_provider,
    error: row.error,
    progress: audioProgressView(row),
    createdAt: row.created_at,
  };
}

/** Transcription is on demand: a stored recording, or a retry after a failure. */
export function canTranscribe(status: AudioAttachmentStatus): boolean {
  return status === "stored" || status === "failed";
}

export function isAudioActive(status: AudioAttachmentStatus): boolean {
  return status === "transcribing";
}

/** A readable title from a file name: no extension, no separators, never empty. */
export function attachmentTitleFromFileName(fileName: string, fallback = "הקלטה"): string {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!base) return fallback;
  return base.length <= 120 ? base : `${base.slice(0, 119).trim()}…`;
}

/**
 * The title of a recording made in the browser: the moment it was made.
 *
 * A recording has no file name, and "הקלטה" three times over is a list nobody
 * can read — the time is the only thing that distinguishes them.
 */
export function recordingTitle(at: Date, timeZone = "Asia/Jerusalem"): string {
  const stamp = new Intl.DateTimeFormat("he-IL", {
    timeZone,
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);
  return `הקלטה · ${stamp}`;
}

/** Newest first — the way every list in this feature is read. */
export function sortAttachments<T extends { createdAt: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** "4.2MB" / "830KB" — the size a learner recognises. */
export function fileSizeLabel(bytes: number | null | undefined): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** The object key for an attachment, inside the shared private audio bucket. */
export function attachmentStoragePath(userId: string, attachmentId: string, extension: string): string {
  const safe = /^[a-z0-9]{1,5}$/.test(extension) ? extension : "audio";
  return `${userId}/attachments/${attachmentId}/audio.${safe}`;
}

/** The extension for a mime type the bucket accepts. */
export function extensionForMime(mime: string): string {
  const map: Record<string, string> = {
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
    "audio/wav": "wav",
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/flac": "flac",
  };
  return map[mime.toLowerCase().split(";")[0].trim()] ?? "audio";
}
