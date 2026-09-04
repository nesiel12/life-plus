import "server-only";
import { generateText, generateObject, streamText, experimental_transcribe as transcribe } from "ai";
import type { z } from "zod";
import type { ChatModelCandidate } from "@/lib/ai/provider";
import { getChatModel, getChatModelChain, getTranscriptionModel } from "@/lib/ai/provider";
import { isRetryableAiError } from "@/lib/ai/retryableError";

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
  attempt: (model: ChatModelCandidate["model"]) => Promise<T>
): Promise<T> {
  const chain = getChatModelChain();
  let lastError: unknown;

  for (let i = 0; i < chain.length; i++) {
    const candidate = chain[i];
    try {
      const result = await attempt(candidate.model);
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

export function streamChatReply(params: { system: string; messages: ChatMessage[] }) {
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

export async function generateChatText(params: { system: string; prompt: string }): Promise<string> {
  return withModelFallback("generateChatText", async (model) => {
    const { text } = await generateText({
      model,
      system: params.system,
      prompt: params.prompt,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
    });
    return text;
  });
}

export async function generateStructuredData<T extends z.ZodTypeAny>(params: { schema: T; system: string; prompt: string }) {
  return withModelFallback("generateStructuredData", async (model) => {
    const { object } = await generateObject({
      model,
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
  });
}

export interface TranscriptionResult {
  text: string;
  durationInSeconds?: number;
}

export async function transcribeAudio(audio: Uint8Array): Promise<TranscriptionResult> {
  const result = await transcribe({ model: getTranscriptionModel(), audio });
  return { text: result.text, durationInSeconds: result.durationInSeconds };
}
