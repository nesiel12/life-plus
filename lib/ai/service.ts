import "server-only";
import { generateText, generateObject, streamObject, streamText, experimental_transcribe as transcribe } from "ai";
import type { z } from "zod";
import type { ChatModelCandidate } from "@/lib/ai/provider";
import { getChatModelChain, getTranscriptionModel } from "@/lib/ai/provider";
import { isRetryableAiError } from "@/lib/ai/retryableError";
import { bytezGenerateObject, bytezGenerateText } from "@/lib/ai/bytez";
import {
  actualAudioMinutes,
  budgetsFor,
  dayWindow,
  estimatedAudioMinutes,
  quotaLimits,
  quotaMessage,
  resetAt,
  type AiActor,
  type AiOperation,
} from "@/lib/ai/quota";
import { adjustAiUnits, consumeAiUnits } from "@/lib/db/aiUsage";
import { geminiTranscribeWindow, type MediaSource, type RawWindowLine } from "@/lib/ai/geminiMedia";

// Same two dated models as the chat chain (lib/ai/provider.ts), and the same
// reason: the "-latest"/"-lite-latest" aliases were both live-verified 503
// "high demand" on 2026-09-24 against the freshly-rotated key, while these
// two returned real 200s. Multimodal (video/audio) generateContent isn't
// restricted to any particular flash tier, so the same pair covers this too.
// "gemini-3.5-flash" leads for the same reason it leads the chat chain as
// of 2026-09-25 (see lib/ai/provider.ts): "gemini-3.6-flash" carries its
// own separate 20-requests/day free-tier cap, live-confirmed via a real
// 429 body, and a lesson's transcription runs one window at a time —
// exactly the repeated-call pattern that cap is smallest for.
const MEDIA_TRANSCRIPTION_MODELS = ["gemini-3.5-flash", "gemini-3.6-flash"];

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
 * to use. "exempt" actors (lib/ai/quota.ts's isQuotaExemptEmail, resolved by
 * lib/ai/actor.ts's currentUserActor) are the same idea for a live person
 * instead of a cron job — the app owner's own account(s), explicitly
 * opted in by email, not every authenticated user (this app has open
 * sign-up).
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
  if (actor.kind === "system" || actor.kind === "exempt") return;

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

/**
 * Whether a chain candidate's label is a Gemini model that both HAS a
 * thinking mode and can be told to turn it off — i.e. worth passing
 * thinkingConfig to at all. Labels are `gemini:<model id>` /
 * `openai:<model id>` / `bytez:<model id>` (lib/ai/provider.ts). A "-lite"
 * Gemini tier live-confirmed 400s on receiving thinkingConfig in any form.
 */
function isThinkingCapableGemini(label: string): boolean {
  return label.startsWith("gemini:") && !label.includes("lite");
}

/**
 * A minimal stand-in for StreamTextResult, carrying only what
 * app/api/chat/route.ts actually calls.
 */
export interface ChatStream {
  toTextStreamResponse(init?: ResponseInit): Response;
}

/**
 * Streams the chat persona's reply, failing over to the next model in the
 * chain — but ONLY before any text has reached the caller.
 *
 * Genuinely diagnosed 2026-09-25: streamText's own error handling does not
 * throw into `for await (const chunk of result.textStream)` — a provider
 * failure (a 503 "high demand", the single most common failure mode seen
 * live against this app's Gemini key) makes the stream end with ZERO
 * chunks and no exception anywhere. Before this fix, that meant
 * `streamChatReply` "succeeded", returned a 200 with an empty body, the
 * route's own try/catch never fired (nothing threw), and the client
 * (components/layout/AICompanion.tsx) read `fullText === ""` and showed
 * "לא הצלחתי להתחבר כרגע" — the exact fallback UI, but with the real cause
 * silently discarded instead of logged. The bug was invisible from either
 * end: not a wrong model or key, an unhandled empty-stream case.
 *
 * The fix: `onError` (which the SDK does invoke) is used to actually
 * capture the failure, and this function reads the FIRST chunk itself
 * before handing anything back — if that first read comes back empty, the
 * failure is real and known, so it is safe to retry the next model in
 * getChatModelChain() (Bytez excluded — no streaming path) instead of
 * discarding it. Once a first chunk is in hand, the original concern this
 * function used to cite (replaying or dropping tokens the user already
 * saw) is real again, so no further fallback happens past that point —
 * the abortSignal bound plus the client's stall watchdog still own a
 * genuine mid-stream hang or drop, unchanged.
 *
 * If every candidate fails before producing a single chunk, this throws
 * for real — which is what makes app/api/chat/route.ts's own catch block
 * actually log the true provider error instead of never seeing one.
 */
export async function streamChatReply(params: {
  system: string;
  messages: ChatMessage[];
  actor: AiActor;
}): Promise<ChatStream> {
  await chargeQuota(params.actor, "chat");

  const chain = getChatModelChain().filter((c): c is Extract<ChatModelCandidate, { kind: "sdk" }> => c.kind === "sdk");
  if (chain.length === 0) {
    throw new Error("[ai] streamChatReply: no configured model supports streaming");
  }

  let lastError: unknown;
  for (let i = 0; i < chain.length; i++) {
    const candidate = chain[i];
    let capturedError: unknown;
    const result = streamText({
      model: candidate.model,
      system: params.system,
      messages: params.messages,
      // The abortSignal every other call in this module already had: without
      // it a provider that accepts the connection and then stalls mid-stream
      // produces a response that never completes and never errors — the
      // "stuck on Life Plus חושב…" symptom, the client sitting in an await
      // that never resolves.
      abortSignal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
      // Zero, not the SDK's own default (2): live-diagnosed 2026-09-25, the
      // SDK's built-in retry re-tries the SAME model with exponential
      // backoff on exactly the errors this function already has its OWN,
      // better retry for — a different model, immediately. Left at the
      // default, a quota-exhausted or overloaded primary burned 20-30s
      // retrying itself 3 times (matching Google's own suggested 8-15s
      // backoff) before this function's fallover ever got a turn, which on
      // a tight STREAM_TIMEOUT_MS budget could exhaust the whole window on
      // a model this function was about to correctly abandon anyway.
      maxRetries: 0,
      // Cuts time-to-first-token for the "thinking" model tier: live-
      // measured 2026-09-25 against gemini-3.6-flash, default thinking took
      // 20s+ to produce a first chunk at all; thinkingBudget: 0 brought that
      // to ~5-7s. NOT harmless on every candidate, live-confirmed the hard
      // way: a "-lite" Gemini model 400s ("Request contains an invalid
      // argument") on receiving thinkingConfig at all, so this is gated to
      // labels that are Gemini and not a lite tier — see isThinkingCapable.
      ...(isThinkingCapableGemini(candidate.label) ? { providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } } } : {}),
      onError: ({ error }) => {
        capturedError = error;
      },
    });

    const iterator = result.textStream[Symbol.asyncIterator]();
    const first = await iterator.next();

    if (first.done) {
      lastError = capturedError ?? new Error(`[ai] streamChatReply: ${candidate.label} produced no output`);
      const isLast = i === chain.length - 1;
      // Same discipline as withModelFallback: a capacity failure (503 "high
      // demand", the one actually seen live against this app's key) is worth
      // another model; a correctness failure (a dead key, a 401) will fail
      // identically everywhere, so stop here instead of multiplying latency.
      const advance = !isLast && isRetryableAiError(capturedError);
      console.error(
        `[ai] streamChatReply: ${candidate.label} produced zero output${advance ? `, falling over to ${chain[i + 1].label}` : ""}:`,
        capturedError instanceof Error ? capturedError.message : capturedError
      );
      if (advance) continue;
      throw lastError;
    }

    if (i > 0) {
      console.warn(`[ai] streamChatReply recovered on fallback model ${candidate.label} (attempt ${i + 1})`);
    }

    // A real first chunk is in hand: reconstruct a stream that starts with it
    // and continues from the same iterator, so nothing is replayed or lost.
    const encoder = new TextEncoder();
    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(first.value));
      },
      async pull(controller) {
        const next = await iterator.next();
        if (next.done) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(next.value));
      },
      async cancel() {
        await iterator.return?.();
      },
    });

    return {
      toTextStreamResponse(init?: ResponseInit): Response {
        return new Response(readable, {
          ...init,
          headers: { "content-type": "text/plain; charset=utf-8", ...(init?.headers ?? {}) },
        });
      },
    };
  }

  throw lastError;
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
      // 0, not the previous 1: plain text has no schema to self-correct on
      // a retry the way generateObject's near-miss retry does (see that
      // function's own maxRetries comment) — a same-model retry here is
      // only ever retrying a capacity failure, which withModelFallback
      // (this function's caller, one line up) already retries against a
      // DIFFERENT model. Same reasoning, and same live 2026-09-25
      // incident, as generateStructuredData gaining its own overridable
      // maxRetries for classifyRouterDomain — see that function's comment.
      maxRetries: 0,
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
  /**
   * Overrides the standard structured-output deadline. For long inputs only —
   * a whole shiur's transcript takes longer to read than a paragraph, and the
   * callers that pass this run in background jobs, not a user's request.
   */
  timeoutMs?: number;
  /**
   * Overrides generateObject's own same-model retry (default 1 — see the
   * call site's comment for why that default exists: a cheap chance to fix
   * a near-miss schema before failing over to a whole different model).
   * Pass 0 for a call where that trade is wrong — cheap, low-stakes
   * generation where withModelFallback's own cross-model retry is strictly
   * better than spending a same-model round trip first. classifyRouterDomain
   * is exactly this: one short enum field, already degrades to "general" on
   * any failure, and runs on every single chat turn — live-observed
   * 2026-09-25, its default retry-then-fallover against an exhausted model
   * was adding several extra seconds to every /api/chat request on top of
   * the equivalent cost inside streamChatReply itself.
   */
  maxRetries?: number;
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
      // burning the whole budget rediscovering that. Overridable — see this
      // function's own maxRetries param doc.
      maxRetries: params.maxRetries ?? 1,
      abortSignal: AbortSignal.timeout(params.timeoutMs ?? STRUCTURED_TIMEOUT_MS),
    });
    return object;
    },
    images && images.length > 0 ? { filter: (c) => c.kind === "sdk" } : {}
  );
}

/**
 * Structured generation that streams: `onPartial` receives ever-more-complete
 * snapshots of the object while the model is still writing it, and the
 * promise resolves with the final, schema-validated object.
 *
 * Exists for the heavy learning generations (a masterclass block, a step
 * brief) that used to sit silent for 20-40s behind generateStructuredData —
 * long enough for the platform or a proxy to cut the request, and long
 * enough that the person assumed it had hung. Streaming keeps bytes moving
 * and lets the UI fill in as the content arrives.
 *
 * Failover goes through withModelFallback like every other call. Each partial
 * is a whole snapshot (not a delta), so a model failing mid-stream and the
 * next one starting over is safe: the next snapshot simply replaces the last.
 * Bytez has no streaming path; as a fallback tier it answers in one piece.
 */
export async function streamStructuredData<T extends z.ZodTypeAny>(params: {
  schema: T;
  system: string;
  prompt: string;
  actor: AiActor;
  operation?: AiOperation;
  onPartial: (partial: unknown) => void;
  timeoutMs?: number;
}): Promise<z.infer<T>> {
  await chargeQuota(params.actor, params.operation ?? "structured");
  return withModelFallback("streamStructuredData", async (candidate) => {
    if (candidate.kind === "bytez") {
      return bytezGenerateObject({ modelId: candidate.modelId, schema: params.schema, system: params.system, prompt: params.prompt });
    }
    let streamError: unknown;
    const result = streamObject({
      model: candidate.model,
      schema: params.schema,
      system: params.system,
      prompt: params.prompt,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(params.timeoutMs ?? STREAM_TIMEOUT_MS),
      onError: ({ error }) => {
        streamError = error;
      },
    });
    for await (const partial of result.partialObjectStream) params.onPartial(partial);
    try {
      return (await result.object) as z.infer<T>;
    } catch (err) {
      // The stream's own error (a 503, a rate limit) is the meaningful one for
      // the retry decision; the object promise only says "no object".
      throw streamError ?? err;
    }
  });
}

/**
 * Transcribes one time window of a lesson's media — uploaded audio (a Gemini
 * Files API URI) or a YouTube video — with timestamps.
 *
 * Gemini-only, and deliberately so: it is the configured provider that reads
 * audio and video directly, so a shiur can be transcribed without Whisper.
 * Charged as one structured request per window rather than per audio minute:
 * the per-minute budget was sized for Whisper's pricing, under which a single
 * 60-minute shiur would exhaust a week of the free allowance, while Gemini
 * prices audio per token at a small fraction of that.
 *
 * Fails over from the lite model to the full flash model on a capacity error
 * only, like withModelFallback.
 */
export async function transcribeMediaWindow(params: {
  source: MediaSource;
  window: { start: number; end: number; from: string; to: string };
  actor: AiActor;
}): Promise<RawWindowLine[]> {
  await chargeQuota(params.actor, "structured");
  const models = MEDIA_TRANSCRIPTION_MODELS;
  let lastError: unknown;
  for (let i = 0; i < models.length; i++) {
    try {
      return await geminiTranscribeWindow({ model: models[i], source: params.source, ...params.window });
    } catch (err) {
      lastError = err;
      if (i === models.length - 1 || !isRetryableAiError(err)) throw err;
      console.warn(`[ai] transcribeMediaWindow failed on ${models[i]}, trying ${models[i + 1]}:`, err instanceof Error ? err.message : err);
    }
  }
  throw lastError;
}

export interface TranscriptionResult {
  text: string;
  durationInSeconds?: number;
}

export async function transcribeAudio(
  audio: Uint8Array,
  actor: AiActor
): Promise<TranscriptionResult> {
  // Reserved from the file size, because Whisper only reports the true
  // duration once it has already processed the audio — by which point the
  // money is spent. The estimate is settled below.
  const estimated = estimatedAudioMinutes(audio.byteLength);
  await chargeQuota(actor, "transcription", estimated);

  const result = await transcribe({ model: getTranscriptionModel(), audio });

  if (actor.kind === "user") {
    const actual = actualAudioMinutes(result.durationInSeconds);
    if (actual !== null && actual !== estimated) {
      // Best-effort: the call already succeeded, so a settle failure must not
      // become an error the user sees.
      await adjustAiUnits(actor.userId, "transcribe_day", dayWindow(new Date()), actual - estimated);
    }
  }

  return { text: result.text, durationInSeconds: result.durationInSeconds };
}
