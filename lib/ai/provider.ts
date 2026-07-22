import "server-only";
import { openai } from "@ai-sdk/openai";

// The one place that knows which AI provider Atlas actually uses (Unified
// AI Provider Layer). Every model selection in lib/ai/service.ts comes from
// here — swapping providers later means changing this file (and, only if
// the new SDK's call shape genuinely differs, service.ts), never any of
// the AI-backed routes. OpenAI only, by explicit instruction: no Gemini
// code, no Gemini package, no provider-selection branching for a provider
// that doesn't exist yet in this codebase.
const CHAT_MODEL_ID = "gpt-4o-mini";
const TRANSCRIPTION_MODEL_ID = "whisper-1";

export function getChatModel() {
  return openai(CHAT_MODEL_ID);
}

export function getTranscriptionModel() {
  return openai.transcription(TRANSCRIPTION_MODEL_ID);
}

// Every AI-backed route previously checked process.env.OPENAI_API_KEY
// directly before deciding whether to call a real model or fall back to an
// honest mock/template — real, working provider-coupling in a codebase
// otherwise disciplined about not leaking it. Routes now ask this instead;
// a future provider swap changes what "configured" means in exactly one
// place.
export function isProviderConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}
