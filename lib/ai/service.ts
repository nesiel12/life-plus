import "server-only";
import { generateText, generateObject, streamText, experimental_transcribe as transcribe } from "ai";
import type { z } from "zod";
import { getChatModel, getTranscriptionModel } from "@/lib/ai/provider";

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
const STRUCTURED_TIMEOUT_MS = 45_000; // generateObject re-prompts on schema mismatch — give it more room

// Returns the SDK's own stream result as-is (callers use its
// toTextStreamResponse method directly, exactly as before) — this service
// hides *which model*, not how the caller consumes a streamed reply.
export function streamChatReply(params: { system: string; messages: ChatMessage[] }) {
  return streamText({ model: getChatModel(), system: params.system, messages: params.messages });
}

export async function generateChatText(params: { system: string; prompt: string }): Promise<string> {
  const { text } = await generateText({
    model: getChatModel(),
    system: params.system,
    prompt: params.prompt,
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
  });
  return text;
}

export async function generateStructuredData<T extends z.ZodTypeAny>(params: { schema: T; system: string; prompt: string }) {
  const { object } = await generateObject({
    model: getChatModel(),
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
}

export interface TranscriptionResult {
  text: string;
  durationInSeconds?: number;
}

export async function transcribeAudio(audio: Uint8Array): Promise<TranscriptionResult> {
  const result = await transcribe({ model: getTranscriptionModel(), audio });
  return { text: result.text, durationInSeconds: result.durationInSeconds };
}
