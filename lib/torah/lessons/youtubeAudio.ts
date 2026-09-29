import "server-only";

import ytdl from "@distube/ytdl-core";

// The last-resort path when Gemini's own direct-URL fetch of a YouTube video
// is blocked — a 403/404 from Google's own infrastructure (geo-restriction,
// age-gating, or YouTube simply throttling that particular video for
// server-side fetchers). Rather than failing the lesson outright, the
// pipeline downloads the video's audio-only stream itself and hands the
// bytes to Gemini's Files API instead — the same path an uploaded-audio
// lesson already takes (lib/torah/lessons/pipeline.ts's uploadAudioToGemini).
//
// This can still fail: a private/removed video, or YouTube blocking the
// datacenter IP this runs from just as it blocked Gemini's. That failure is
// permanent and surfaces the "upload the audio yourself" fallback in the UI
// (LessonProcessing.tsx) rather than retrying.

/**
 * Ceiling on the audio track kept in memory before it is handed to Gemini.
 * Sized well above a typical long shiur at a low speech bitrate, but far
 * below what would risk the worker step's own memory — a track this large
 * means either an unusually long recording or an unexpectedly high-bitrate
 * format, and either way the manual-upload fallback is the safer path.
 */
const MAX_FALLBACK_AUDIO_BYTES = 200 * 1024 * 1024;

export class YoutubeAudioUnavailableError extends Error {}

export interface YoutubeAudioTrack {
  bytes: Uint8Array;
  mimeType: string;
}

/** The lowest-bitrate audio-only format under the size ceiling — speech doesn't need music-grade audio. */
function pickFormat(formats: ytdl.videoFormat[]): ytdl.videoFormat {
  const audioOnly = ytdl.filterFormats(formats, "audioonly");
  if (audioOnly.length === 0) throw new YoutubeAudioUnavailableError("no audio-only format available");

  const bySize = audioOnly.filter((f) => {
    const length = Number(f.contentLength || 0);
    return length === 0 || length <= MAX_FALLBACK_AUDIO_BYTES;
  });
  const candidates = bySize.length > 0 ? bySize : audioOnly;
  return candidates.slice().sort((a, b) => (a.audioBitrate ?? 0) - (b.audioBitrate ?? 0))[0];
}

/** Downloads one YouTube video's audio track into memory. */
export async function downloadYoutubeAudio(url: string): Promise<YoutubeAudioTrack> {
  let info: ytdl.videoInfo;
  try {
    info = await ytdl.getInfo(url);
  } catch (err) {
    throw new YoutubeAudioUnavailableError(err instanceof Error ? err.message : "ytdl getInfo failed");
  }

  const format = pickFormat(info.formats);
  const mimeType = format.mimeType?.split(";")[0]?.trim() || "audio/mp4";

  const chunks: Buffer[] = [];
  let total = 0;
  await new Promise<void>((resolve, reject) => {
    const stream = ytdl.downloadFromInfo(info, { format });
    stream.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_FALLBACK_AUDIO_BYTES) {
        stream.destroy(new YoutubeAudioUnavailableError("audio track exceeded the fallback size limit"));
        return;
      }
      chunks.push(chunk);
    });
    stream.on("end", resolve);
    stream.on("error", reject);
  });

  return { bytes: new Uint8Array(Buffer.concat(chunks)), mimeType };
}
