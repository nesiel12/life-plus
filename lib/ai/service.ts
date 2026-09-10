import "server-only";
import { generateText, generateObject, streamText } from "ai";
import type { z } from "zod";
import type { ChatModelCandidate } from "@/lib/ai/provider";
import {
  getChatModel,
  getChatModelChain,
  getGeminiAudioModel,
  transcriptionPlan,
  WHISPER_MODEL_ID,
} from "@/lib/ai/provider";
import { isRetryableAiError } from "@/lib/ai/retryableError";
import { bytezGenerateObject, bytezGenerateText } from "@/lib/ai/bytez";
import {
  budgetsFor,
  estimatedAudioMinutes,
  quotaLimits,
  quotaMessage,
  resetAt,
  type AiActor,
  type AiOperation,
} from "@/lib/ai/quota";
import { consumeAiUnits } from "@/lib/db/aiUsage";

// The one shared AI service (Unified AI Provider Layer) — every AI-backed
// route calls through here instead of importing the `ai` SDK or
// @ai-sdk/openai directly. Deliberately plain exported functions, not a
// class implementing a formal interface: there is exactly one provider
// today, and a plugin contract with no second implementation to validate
// it against would be the speculative abstraction this milestone was
// explicitly told to avoid. Each function is a thin passthrough — same
// call shape, same return shape the four AI-backed routes already
// depended on — with only the model selection now living in
// lib/ai/provider.ts instead of scattered across every route.

/**
 * Thrown when a user has spent their free allowance.
 *
 * A named class rather than a plain Error so routes can map it to a 429 with
 * the real reason, instead of the generic 500 every other AI failure becomes.
 * A user who has hit a limit has done nothing wrong and needs to be told
 * what happened and when it clears, not shown "something went wrong".
 */
export class AiQuotaExceededError extends Error {
  readonly scope: string;
  readonly resetAt: Date;

  constructor(scope: string, message: string, resetAt: Date) {
    super(message);
    this.name = "AiQuotaExceededError";
    this.scope = scope;
    this.resetAt = resetAt;
  }
}

/**
 * Charges the actor's quota, or refuses.
 *
 * System actors are exempt: the Proactive Engine's per-user jobs are the
 * owner's own scheduled work, not something the user asked for, and charging
 * them would let a nightly cron quietly eat the allowance someone was about
 * to use.
 *
 * The quota is charged *before* the model call, not after. Charging on
 * success would let a user fire unlimited requests that fail — and every one
 * of those still costs money at the provider.
 */
async function chargeQuota(
  actor: AiActor,
  operation: AiOperation,
  audioMinutes = 0
): Promise<void> {
  if (actor.kind === "system") return;

  const now = new Date();
  const budgets = budgetsFor(operation, now, quotaLimits(), audioMinutes);
  const result = await consumeAiUnits(actor.userId, budgets);

  if (!result.allowed) {
    const scope = result.rejectedScope ?? "day";
    throw new AiQuotaExceededError(scope, quotaMessage(scope, now), resetAt(scope, now));
  }
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// A hard ceiling on non-streaming generation. A slow or overloaded provider
// (e.g. a "flash-latest" alias returning 503s for an hour, 2026-08-31) must
// fail to the caller's honest fallback, never hang the request. Passed as an
// abortSignal so it cancels the underlying fetch, not just the awaited promise.
// These are the INNER bound, and every AI route's `maxDuration` must sit
// above them. Routes previously declared maxDuration = 30 while structured
// generation waited 45s, so the platform killed the request before the app's
// own timeout could fire — the user got a raw "operation was aborted"
// instead of the graceful Hebrew fallback each route already has ready.
// Keeping the app's deadline strictly inside the platform's is what makes
// those fallbacks reachable.
const GENERATION_TIMEOUT_MS = 40_000;
// Streaming gets a longer bound than one-shot generation: a long reply
// legitimately takes longer to finish than a short structured extraction,
// and the client aborts sooner on a *stall* anyway.
const STREAM_TIMEOUT_MS = 50_000;
const STRUCTURED_TIMEOUT_MS = 45_000; // generateObject re-prompts on schema mismatch — give it more room
// Vision requests carry an image, not a sentence: uploading and reading a
// photographed timetable takes materially longer than a text prompt.
const VISION_TIMEOUT_MS = 90_000;

// Returns the SDK's own stream result as-is (callers use its
// toTextStreamResponse method directly, exactly as before) — this service
// hides *which model*, not how the caller consumes a streamed reply.
/**
 * Runs `attempt` against each model in the failover chain until one succeeds.
 *
 * This is the single place system-wide AI resiliency lives, and that is
 * deliberate: every AI-backed route already calls through this module, so
 * implementing failover here makes calendar, study, finance, task, nutrition
 * and chat resilient at once — rather than twelve near-identical try/catch
 * blocks that would drift apart the first time one was edited.
 *
 * Only capacity failures advance the chain (see isRetryableAiError): a dead
 * API key or an unsatisfiable schema fails the same way on every model, so
 * retrying it just delays the same error. The last error is rethrown when
 * every model is exhausted, so each route's own honest Hebrew fallback still
 * runs exactly as before — this narrows how often that path is reached, it
 * does not replace it.
 */
async function withModelFallback<T>(
  operation: string,
  attempt: (candidate: ChatModelCandidate) => Promise<T>,
  options: { filter?: (candidate: ChatModelCandidate) => boolean } = {}
): Promise<T> {
  const full = getChatModelChain();
  const chain = options.filter ? full.filter(options.filter) : full;
  if (chain.length === 0) {
    throw new Error(`[ai] ${operation}: no configured model supports this request`);
  }
  let lastError: unknown;

  for (let i = 0; i < chain.length; i++) {
    const candidate = chain[i];
    try {
      const result = await attempt(candidate);
      if (i > 0) {
        console.warn(`[ai] ${operation} recovered on fallback model ${candidate.label} (attempt ${i + 1})`);
      }
      return result;
    } catch (err) {
      lastError = err;
      const isLast = i === chain.length - 1;
      if (isLast || !isRetryableAiError(err)) throw err;
      console.warn(
        `[ai] ${operation} failed on ${candidate.label}, falling over to ${chain[i + 1].label}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  throw lastError;
}

export async function streamChatReply(params: {
  system: string;
  messages: ChatMessage[];
  actor: AiActor;
}) {
  await chargeQuota(params.actor, "chat");

  // The abortSignal every other call in this module already had, and this one
  // was missing. Without it a provider that accepts the connection and then
  // stalls mid-stream produces a response that never completes and never
  // errors — which is exactly the "stuck on Life Plus חושב…" symptom, since
  // the client is sitting in an await that will never resolve.
  //
  // Deliberately not routed through withModelFallback: failing over
  // mid-stream would mean either replaying tokens the user has already seen
  // or silently discarding them. The bound here plus the client's own stall
  // watchdog (components/layout/AICompanion.tsx) turn a hang into a clean,
  // honest error instead.
  return streamText({
    model: getChatModel(),
    system: params.system,
    messages: params.messages,
    abortSignal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
  });
}

export async function generateChatText(params: {
  system: string;
  prompt: string;
  actor: AiActor;
  /** Defaults to a plain chat-weight call. */
  operation?: AiOperation;
}): Promise<string> {
  await chargeQuota(params.actor, params.operation ?? "chat");
  return withModelFallback("generateChatText", async (candidate) => {
    if (candidate.kind === "bytez") {
      return bytezGenerateText({ modelId: candidate.modelId, system: params.system, prompt: params.prompt });
    }
    const { text } = await generateText({
      model: candidate.model,
      system: params.system,
      prompt: params.prompt,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
    });
    return text;
  });
}

export async function generateStructuredData<T extends z.ZodTypeAny>(params: {
  schema: T;
  system: string;
  prompt: string;
  actor: AiActor;
  /** Defaults to a plain structured call; pass "course_module" for the heavy one. */
  operation?: AiOperation;
  /**
   * Images to read alongside the prompt — a photographed timetable, say.
   *
   * Restricts the fallback chain to SDK candidates: lib/ai/bytez.ts is a
   * prompted-JSON text integration with no image path, so including it would
   * mean silently answering a "read this picture" request from the prompt
   * alone. Better to have one fewer fallback than a confidently wrong answer
   * about an image the model never saw.
   */
  images?: Uint8Array[];
}) {
  await chargeQuota(params.actor, params.operation ?? "structured");
  const { images } = params;
  return withModelFallback(
    "generateStructuredData",
    async (candidate) => {
    if (images && images.length > 0) {
      if (candidate.kind === "bytez") throw new Error("bytez cannot read images");
      const { object } = await generateObject({
        model: candidate.model,
        schema: params.schema,
        system: params.system,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: params.prompt },
              ...images.map((image) => ({ type: "image" as const, image })),
            ],
          },
        ],
        maxRetries: 1,
        // Vision calls carry far more input than a text prompt, so they get
        // the longer of the two budgets rather than the standard one.
        abortSignal: AbortSignal.timeout(VISION_TIMEOUT_MS),
      });
      return object;
    }

    if (candidate.kind === "bytez") {
      // See lib/ai/bytez.ts: prompted JSON, not native schema enforcement.
      // No abortSignal/maxRetries plumbing to match here — callBytez
      // carries its own timeout, and a schema-validation failure is
      // deliberately not retried within this one call the way
      // generateObject retries a single model's near-miss.
      return bytezGenerateObject({
        modelId: candidate.modelId,
        schema: params.schema,
        system: params.system,
        prompt: params.prompt,
      });
    }
    const { object } = await generateObject({
      model: candidate.model,
      schema: params.schema,
      system: params.system,
      prompt: params.prompt,
      // Bound the re-prompt loop explicitly. generateObject retries when the
      // model returns output that doesn't match the schema, and each retry is
      // a full round trip — the SDK's default of 2 means a worst case of three
      // sequential calls, which is how a request that "should" take 8s ends up
      // hitting the deadline. One retry is enough to recover a genuine
      // one-off malformed response; a schema the model consistently can't
      // satisfy should fail fast to the caller's fallback instead of
      // burning the whole budget rediscovering that.
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(STRUCTURED_TIMEOUT_MS),
    });
    return object;
    },
    images && images.length > 0 ? { filter: (c) => c.kind === "sdk" } : {}
  );
}

export interface TranscriptionResult {
  text: string;
  durationInSeconds?: number;
}

const TRANSCRIBE_TIMEOUT_MS = 55_000;

const TRANSCRIBE_PROMPT =
  "Transcribe this audio recording verbatim. Return ONLY the spoken words, with no " +
  "preamble, no quotation marks, no translation, and no commentary. Keep the original " +
  "language (usually Hebrew). If there is no discernible speech, return an empty string.";

// Browsers hand MediaRecorder blobs like "audio/webm;codecs=opus" or
// "audio/mp4". Providers want a bare type; strip parameters and normalise the
// couple of aliases that matter.
function normaliseAudioType(raw: string | undefined): string {
  const base = (raw ?? "").split(";")[0].trim().toLowerCase();
  if (!base || !base.startsWith("audio/")) return "audio/webm";
  if (base === "audio/x-m4a" || base === "audio/m4a") return "audio/mp4";
  if (base === "audio/mpeg") return "audio/mp3";
  return base;
}

function extensionFor(mediaType: string): string {
  const map: Record<string, string> = {
    "audio/webm": "webm",
    "audio/mp4": "m4a",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/ogg": "ogg",
    "audio/flac": "flac",
  };
  return map[mediaType] ?? "webm";
}

async function transcribeWithGemini(audio: Uint8Array, mediaType: string): Promise<string> {
  const { text } = await generateText({
    model: getGeminiAudioModel(),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: TRANSCRIBE_PROMPT },
          { type: "file", data: audio, mediaType },
        ],
      },
    ],
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
  });
  return text.trim();
}

async function transcribeWithWhisper(audio: Uint8Array, mediaType: string): Promise<string> {
  // Direct REST rather than the AI SDK's experimental_transcribe: the pinned
  // @ai-sdk/openai (v4-spec) transcription model does not carry its auth
  // header through this `ai` runtime, so the SDK call 401s even with a valid
  // key. Same "plain fetch beats a broken SDK path" choice the Google
  // Calendar and Bytez integrations already make.
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("no OpenAI key");
  const form = new FormData();
  form.set(
    "file",
    new Blob([audio as BlobPart], { type: mediaType }),
    `audio.${extensionFor(mediaType)}`
  );
  form.set("model", WHISPER_MODEL_ID);
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`whisper ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}

export async function transcribeAudio(
  audio: Uint8Array,
  actor: AiActor,
  rawMediaType?: string
): Promise<TranscriptionResult> {
  const plan = transcriptionPlan();
  if (plan.length === 0) {
    throw new Error("[ai] transcribeAudio: no transcription backend configured");
  }

  const mediaType = normaliseAudioType(rawMediaType);
  // Reserved from the file size up front; there is no reliable duration from
  // either backend, so this estimate stands (no post-hoc settle).
  const estimated = estimatedAudioMinutes(audio.byteLength);
  await chargeQuota(actor, "transcription", estimated);

  let lastError: unknown;
  for (let i = 0; i < plan.length; i++) {
    const backend = plan[i];
    try {
      const text =
        backend === "gemini"
          ? await transcribeWithGemini(audio, mediaType)
          : await transcribeWithWhisper(audio, mediaType);
      if (i > 0) console.warn(`[ai] transcribeAudio recovered on fallback backend "${backend}"`);
      return { text };
    } catch (err) {
      lastError = err;
      const isLast = i === plan.length - 1;
      console.error(`[ai] transcribeAudio failed on "${backend}":`, err instanceof Error ? err.message : err);
      if (isLast || !isRetryableAiError(err)) throw err;
    }
  }
  throw lastError;
}
