import "server-only";

import { isMediaTranscriptionConfigured, transcribeMediaWindow } from "@/lib/ai";
import { AiQuotaExceededError } from "@/lib/ai/service";
import { deleteGeminiFile, getGeminiFile, uploadGeminiFile, waitForGeminiFileActive } from "@/lib/ai/geminiMedia";
import type { AiActor } from "@/lib/ai/quota";
import { entityAudioRepo } from "@/lib/db/entityAudio";
import { readAudioProgress, type AudioTranscriptionProgress } from "@/lib/torah/attachments/audio";
import { downloadAttachment } from "@/lib/torah/attachments/storage";
import { MAX_MEDIA_SECONDS } from "@/lib/torah/lessons/media";
import {
  appendWindowLines,
  linesToText,
  normalizeWindowLines,
  parseStoredLines,
  planWindows,
  windowRangeLabel,
  type TranscriptLine,
} from "@/lib/torah/lessons/transcript";
import type { Database, Json } from "@/types/database";

type AudioRow = Database["public"]["Tables"]["entity_audio"]["Row"];
type AudioUpdate = Database["public"]["Tables"]["entity_audio"]["Update"];

// On-demand transcription for a universal audio attachment.
//
// The same shape as the lessons pipeline (lib/torah/lessons/pipeline.ts) and
// for the same reasons — resumable steps under a row lease, one transcription
// window per step, the transcript committed after every window — but it stops
// where the brief stops: an attachment produces a transcript, not chapters,
// sources, learning chunks or practice questions. That is the whole difference
// between "a shiur I am studying" and "a recording I want to be able to read".
//
// It is a separate worker rather than a branch inside the lessons pipeline
// because every step there is written against a lessons row and its status
// machine; threading a second row type through it would put both features one
// careless edit away from each other.

/** A worker holds a step for at most this long before another may retry it. */
const LEASE_SECONDS = 300;
/** Same window size as an audio lesson: ~10 minutes of speech per model call. */
const WINDOW_SECONDS = envSeconds("ATTACHMENT_WINDOW_SECONDS", 600);
/** Consecutive failures before the attachment is marked failed. */
const MAX_STEP_FAILURES = 3;
/** Audio bitrate assumed when the browser could not read the duration (128 kbps). */
const ASSUMED_AUDIO_BYTES_PER_SECOND = 16_000;

function envSeconds(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 30 ? value : fallback;
}

/** A step failure with the Hebrew reason the learner sees. */
class AudioStepError extends Error {
  readonly userMessage: string;
  readonly permanent: boolean;

  constructor(userMessage: string, permanent = false) {
    super(userMessage);
    this.name = "AudioStepError";
    this.userMessage = userMessage;
    this.permanent = permanent;
  }
}

interface StepResult {
  patch: AudioUpdate;
  finished?: boolean;
}

export interface AdvanceAudioOptions {
  /** Scope the claim to one user; null for the cross-user sweep. */
  userId: string | null;
  budgetMs: number;
}

export interface AdvanceAudioResult {
  steps: number;
  status: AudioRow["status"] | null;
}

function actorFor(row: AudioRow): AiActor {
  // The learner asked for this transcription, so it is charged to them — the
  // sweep is only a worker finishing what they started.
  return { kind: "user", userId: row.user_id };
}

/**
 * Runs as many steps as fit in the budget. Never throws: the callers are a
 * cron sweep and an after() hook, neither of which has anyone to report an
 * exception to, so a failure is recorded on the row instead.
 */
export async function advanceAudioTranscription(
  audioId: string,
  options: AdvanceAudioOptions
): Promise<AdvanceAudioResult> {
  const deadline = Date.now() + options.budgetMs;
  let steps = 0;
  let status: AudioRow["status"] | null = null;

  while (Date.now() < deadline) {
    let row: AudioRow | null;
    try {
      row = await entityAudioRepo.claimStep(audioId, options.userId, LEASE_SECONDS);
    } catch (err) {
      console.error("[audio] claim failed:", err);
      break;
    }
    if (!row) break;

    const progress = readAudioProgress(row.progress);
    try {
      const result = await runStep(row, progress);
      const saved = await entityAudioRepo.release(row.user_id, row.id, { attempts: 0, ...result.patch });
      steps++;
      status = saved.status;
      if (result.finished || saved.status === "ready" || saved.status === "failed") break;
    } catch (err) {
      status = await recordFailure(row, progress, err);
      break;
    }
  }

  return { steps, status };
}

async function recordFailure(
  row: AudioRow,
  progress: AudioTranscriptionProgress,
  err: unknown
): Promise<AudioRow["status"]> {
  if (err instanceof AiQuotaExceededError) {
    // Not a failure: the day's AI allowance is spent. The recording waits and
    // continues by itself when the allowance resets — exactly as a lesson does.
    await entityAudioRepo
      .release(row.user_id, row.id, {
        progress: {
          ...progress,
          pausedUntil: err.resetAt.toISOString(),
          pauseReason: "הגעת למכסת ה-AI היומית. התמלול ימשיך אוטומטית כשהמכסה תתחדש.",
        } as unknown as Json,
      })
      .catch(() => undefined);
    return row.status;
  }

  const message = err instanceof AudioStepError ? err.userMessage : "שלב בתמלול נכשל.";
  const permanent = err instanceof AudioStepError && err.permanent;
  const attempts = row.attempts + 1;
  console.error(`[audio] step failed for ${row.id} (attempt ${attempts}):`, err);

  if (permanent || attempts >= MAX_STEP_FAILURES) {
    await entityAudioRepo
      .release(row.user_id, row.id, {
        status: "failed",
        error: permanent ? message : `${message} ניסינו ${attempts} פעמים — אפשר לנסות שוב.`,
        attempts,
        progress: { ...progress, lastError: message } as unknown as Json,
      })
      .catch(() => undefined);
    return "failed";
  }

  await entityAudioRepo
    .release(row.user_id, row.id, { attempts, progress: { ...progress, lastError: message } as unknown as Json })
    .catch(() => undefined);
  return row.status;
}

async function runStep(row: AudioRow, progress: AudioTranscriptionProgress): Promise<StepResult> {
  if (progress.phase === "transcribe") return transcribeNextWindow(row, progress);
  return planTranscription(row, progress);
}

// ---------------------------------------------------------------------------
// Step 1 — upload to Gemini and plan the windows
// ---------------------------------------------------------------------------

async function planTranscription(row: AudioRow, progress: AudioTranscriptionProgress): Promise<StepResult> {
  if (!isMediaTranscriptionConfigured()) {
    throw new AudioStepError("אין מפתח Gemini מחובר, ולכן אי אפשר לתמלל הקלטות.", true);
  }

  const estimated = !row.duration_seconds;
  const duration = row.duration_seconds ?? Math.ceil((row.size_bytes ?? 0) / ASSUMED_AUDIO_BYTES_PER_SECOND);
  if (duration <= 0) throw new AudioStepError("ההקלטה ריקה.", true);

  const geminiFile = await uploadToGemini(row);

  return {
    patch: {
      error: null,
      progress: {
        ...progress,
        phase: "transcribe",
        geminiFile,
        windows: planWindows(Math.min(duration, MAX_MEDIA_SECONDS), WINDOW_SECONDS),
        nextWindow: 0,
        estimatedDuration: estimated,
        emptyWindows: 0,
        pausedUntil: undefined,
        pauseReason: undefined,
        lastError: undefined,
      } as unknown as Json,
    },
  };
}

async function uploadToGemini(row: AudioRow): Promise<NonNullable<AudioTranscriptionProgress["geminiFile"]>> {
  let bytes: Uint8Array;
  try {
    bytes = await downloadAttachment(row.storage_path);
  } catch {
    throw new AudioStepError("קובץ ההקלטה לא נמצא באחסון. ייתכן שההעלאה לא הושלמה.", true);
  }
  const uploaded = await uploadGeminiFile(bytes, row.mime, `attachment-${row.id}`);
  const active = uploaded.state === "ACTIVE" ? uploaded : await waitForGeminiFileActive(uploaded.name);
  return { name: active.name, uri: active.uri, mimeType: active.mimeType, expiresAt: active.expirationTime };
}

// ---------------------------------------------------------------------------
// Step 2 — one window per step
// ---------------------------------------------------------------------------

async function transcribeNextWindow(row: AudioRow, progress: AudioTranscriptionProgress): Promise<StepResult> {
  const windows = progress.windows ?? [];
  const index = progress.nextWindow ?? 0;
  if (index >= windows.length) return finish(row, progress);

  // Files API uploads expire after 48 hours; a recording paused on quota for
  // two days needs a fresh one.
  let geminiFile = progress.geminiFile;
  const expiresSoon = !geminiFile?.expiresAt || new Date(geminiFile.expiresAt).getTime() < Date.now() + 10 * 60_000;
  if (!geminiFile || expiresSoon || !(await getGeminiFile(geminiFile.name).catch(() => null))) {
    geminiFile = await uploadToGemini(row);
  }

  const window = windows[index];
  let raw;
  try {
    raw = await transcribeMediaWindow({
      source: { kind: "file", uri: geminiFile.uri, mimeType: geminiFile.mimeType },
      window: { ...window, ...windowRangeLabel(window) },
      actor: actorFor(row),
    });
  } catch (err) {
    if (err instanceof AiQuotaExceededError) throw err;
    throw new AudioStepError("תמלול קטע מההקלטה נכשל.");
  }

  const lines = normalizeWindowLines(raw, window);
  const existing = parseStoredLines(row.transcript_lines);
  const merged = appendWindowLines(existing, lines);

  const emptyWindows = lines.length === 0 ? (progress.emptyWindows ?? 0) + 1 : 0;
  const nextWindow = index + 1;
  // An estimated duration can overshoot: two silent windows in a row past the
  // halfway point mean the recording has ended.
  const endedEarly = progress.estimatedDuration && emptyWindows >= 2 && nextWindow > windows.length / 2;
  const nextProgress: AudioTranscriptionProgress = { ...progress, geminiFile, nextWindow, emptyWindows, lastError: undefined };

  if (nextWindow >= windows.length || endedEarly) return finish(row, nextProgress, merged);

  // Committed after EVERY window: this is what makes the step resumable, and
  // it is also what lets the widget show the transcript growing.
  return {
    patch: {
      transcript: linesToText(merged),
      transcript_lines: merged as unknown as Json,
      transcript_provider: "gemini",
      progress: nextProgress as unknown as Json,
    },
  };
}

async function finish(
  row: AudioRow,
  progress: AudioTranscriptionProgress,
  lines?: TranscriptLine[]
): Promise<StepResult> {
  const finalLines = lines ?? parseStoredLines(row.transcript_lines);
  if (finalLines.length === 0) {
    throw new AudioStepError("לא נמצא דיבור בהקלטה. ודא שהקובץ תקין ושיש בו שמע.", true);
  }
  if (progress.geminiFile) void deleteGeminiFile(progress.geminiFile.name);

  const lastEnd = finalLines[finalLines.length - 1].end;
  return {
    patch: {
      status: "ready",
      error: null,
      transcript: linesToText(finalLines),
      transcript_lines: finalLines as unknown as Json,
      transcript_provider: "gemini",
      duration_seconds: progress.estimatedDuration || !row.duration_seconds ? Math.round(lastEnd) : row.duration_seconds,
      progress: { ...progress, phase: undefined, geminiFile: undefined, nextWindow: progress.windows?.length ?? 0 } as unknown as Json,
    },
    finished: true,
  };
}

// ---------------------------------------------------------------------------
// The sweep — scripts/cron.ts → audio_transcription
// ---------------------------------------------------------------------------

export async function runAudioTranscriptionSweep(budgetMs: number): Promise<{ recordings: number; steps: number }> {
  const deadline = Date.now() + budgetMs;
  const claimable = await entityAudioRepo.listClaimable(20);
  let steps = 0;
  let recordings = 0;

  for (const audio of claimable) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const result = await advanceAudioTranscription(audio.id, { userId: null, budgetMs: remaining });
    if (result.steps > 0) recordings++;
    steps += result.steps;
  }
  return { recordings, steps };
}
