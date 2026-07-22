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

// Returns the SDK's own stream result as-is (callers use its
// toTextStreamResponse method directly, exactly as before) — this service
// hides *which model*, not how the caller consumes a streamed reply.
export function streamChatReply(params: { system: string; messages: ChatMessage[] }) {
  return streamText({ model: getChatModel(), system: params.system, messages: params.messages });
}

export async function generateChatText(params: { system: string; prompt: string }): Promise<string> {
  const { text } = await generateText({ model: getChatModel(), system: params.system, prompt: params.prompt });
  return text;
}

export async function generateStructuredData<T extends z.ZodTypeAny>(params: { schema: T; system: string; prompt: string }) {
  const { object } = await generateObject({
    model: getChatModel(),
    schema: params.schema,
    system: params.system,
    prompt: params.prompt,
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
