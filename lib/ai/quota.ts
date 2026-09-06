// The free-tier AI quota policy: what each operation costs, what the limits
// are, and which window a request falls in.
//
// Pure and separately tested. Everything here is arithmetic and configuration
// reading — no database, no session — so the rules can be verified without a
// Postgres round trip, and so the one place that decides "this costs three
// units" is readable in isolation.
//
// The enforcement itself lives in the database (see the migration): only a
// single transaction can check and charge without a concurrency hole.

/** What kind of model call is being made. Determines the cost weight. */
export type AiOperation =
  | "chat"
  | "structured"
  | "course_module"
  | "transcription";

/**
 * Who is spending.
 *
 * A discriminated union rather than an optional userId, so a call site cannot
 * forget to say. `system` is for scheduled work the owner runs on their own
 * behalf — the Proactive Engine's per-user jobs are the owner's cron, not
 * something the user asked for, and billing them for it would let a nightly
 * job silently eat the quota they were about to use.
 */
export type AiActor =
  | { kind: "user"; userId: string }
  | { kind: "system"; job: string };

export const DEFAULT_REQUESTS_PER_DAY = 40;
export const DEFAULT_TRANSCRIPTION_MINUTES_PER_DAY = 10;
export const DEFAULT_REQUESTS_PER_MINUTE = 6;

/**
 * Cost in units, by operation.
 *
 * Not all 1. A course module asks for three to six sections of at least 400
 * characters each plus a quiz, so it emits several times the output of a chat
 * turn and costs proportionally more. Treating every call as one unit would
 * price the whole free tier off the cheapest possible request and let the
 * most expensive one through forty times a day.
 *
 * Transcription is absent on purpose: it is charged in audio minutes against
 * its own budget, because Whisper is priced per minute of audio and a single
 * call can cost two hundred times a chat turn. Folding it into a request
 * count would make ten transcriptions cost less than eleven chat messages.
 */
const UNIT_COST: Record<Exclude<AiOperation, "transcription">, number> = {
  chat: 1,
  structured: 1,
  course_module: 3,
};

export function unitCost(operation: AiOperation): number {
  return operation === "transcription" ? 0 : UNIT_COST[operation];
}

/** Reads a positive integer from the environment, or falls back. */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  // A malformed value must not silently become 0, which would lock every
  // user out of every AI feature — the same fail-closed trap the sign-in
  // allow-list used to have.
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) return fallback;
  return parsed;
}

export interface QuotaLimits {
  requestsPerDay: number;
  transcriptionMinutesPerDay: number;
  requestsPerMinute: number;
}

export function quotaLimits(): QuotaLimits {
  return {
    requestsPerDay: envInt("FREE_AI_REQUESTS_PER_DAY", DEFAULT_REQUESTS_PER_DAY),
    transcriptionMinutesPerDay: envInt(
      "FREE_AI_TRANSCRIPTION_MINUTES_PER_DAY",
      DEFAULT_TRANSCRIPTION_MINUTES_PER_DAY
    ),
    requestsPerMinute: envInt("FREE_AI_REQUESTS_PER_MINUTE", DEFAULT_REQUESTS_PER_MINUTE),
  };
}

export type QuotaScope = "day" | "minute" | "transcribe_day";

export interface Budget {
  scope: QuotaScope;
  /** ISO instant marking the start of the window. */
  window: string;
  cost: number;
  limit: number;
}

/** Midnight UTC of the instant's day. */
export function dayWindow(at: Date): string {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())).toISOString();
}

/** Top of the instant's minute. */
export function minuteWindow(at: Date): string {
  const d = new Date(at);
  d.setUTCSeconds(0, 0);
  return d.toISOString();
}

/**
 * Estimated audio minutes for a file of this size.
 *
 * Only an estimate — bitrate varies by an order of magnitude between codecs,
 * and the real duration is not known until Whisper answers. It is charged up
 * front anyway because by the time the true duration is available the money
 * has already been spent, and then settled against the real figure (see
 * settleTranscription). Rounded up, and never free: a ten-second clip still
 * costs a minute, or a thousand tiny files would cost nothing.
 */
const BYTES_PER_AUDIO_MINUTE = 1_000_000;

export function estimatedAudioMinutes(fileSizeBytes: number): number {
  if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) return 1;
  return Math.max(1, Math.ceil(fileSizeBytes / BYTES_PER_AUDIO_MINUTE));
}

/** Actual minutes to charge, given what the model reported. */
export function actualAudioMinutes(durationInSeconds: number | undefined): number | null {
  if (durationInSeconds === undefined || !Number.isFinite(durationInSeconds)) return null;
  if (durationInSeconds <= 0) return 1;
  return Math.max(1, Math.ceil(durationInSeconds / 60));
}

/**
 * The budgets a single call must clear.
 *
 * Every operation hits the burst budget, including transcription — the point
 * of the per-minute cap is to stop any kind of hammering, and exempting the
 * most expensive call from it would be backwards.
 */
export function budgetsFor(
  operation: AiOperation,
  at: Date,
  limits: QuotaLimits,
  audioMinutes = 0
): Budget[] {
  const budgets: Budget[] = [
    { scope: "minute", window: minuteWindow(at), cost: 1, limit: limits.requestsPerMinute },
  ];

  if (operation === "transcription") {
    budgets.push({
      scope: "transcribe_day",
      window: dayWindow(at),
      cost: Math.max(1, audioMinutes),
      limit: limits.transcriptionMinutesPerDay,
    });
  } else {
    budgets.push({
      scope: "day",
      window: dayWindow(at),
      cost: unitCost(operation),
      limit: limits.requestsPerDay,
    });
  }

  return budgets;
}

/** When the window a scope belongs to rolls over. */
export function resetAt(scope: QuotaScope, at: Date): Date {
  if (scope === "minute") {
    const d = new Date(at);
    d.setUTCSeconds(0, 0);
    return new Date(d.getTime() + 60_000);
  }
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() + 1));
}

/** Hebrew, user-facing. Says which budget ran out and when it comes back. */
export function quotaMessage(scope: QuotaScope, at: Date): string {
  const reset = resetAt(scope, at);
  if (scope === "minute") {
    return "יותר מדי בקשות ברצף. המתן דקה ונסה שוב.";
  }
  const when = reset.toLocaleString("he-IL", { hour: "2-digit", minute: "2-digit" });
  if (scope === "transcribe_day") {
    return `מיצית את מכסת התמלול החינמית להיום. המכסה מתחדשת בחצות (${when}).`;
  }
  return `מיצית את מכסת ה-AI החינמית שלך להיום. המכסה מתחדשת בחצות (${when}).`;
}
