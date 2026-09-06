import "server-only";
import { openai } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { resolveChatProvider, type ChatProvider } from "@/lib/ai/resolveChatProvider";

// The one place that knows which AI provider Atlas actually uses (Unified
// AI Provider Layer). Every model selection in lib/ai/service.ts comes from
// here — swapping/adding providers means changing this file (and, only if
// the new SDK's call shape genuinely differs, service.ts), never any of
// the AI-backed routes.
//
// Two chat providers are supported — Google Gemini and OpenAI — selected by
// which API key is actually configured, resolved once here rather than
// duplicated per route. This explicitly overrides this file's own earlier
// "OpenAI only" note: that was correct when there was exactly one working
// provider to validate a plugin contract against; there are two now, chosen
// deliberately, not speculative.
//
// Gemini wins when both keys are present. It is the cheaper, faster choice
// for this app's workload (short generations — insights, goal breakdowns,
// structured extraction), and OpenAI stays configured specifically to be
// the fallback: getChatModelChain() below tries Gemini first and only
// reaches OpenAI on a genuine capacity failure (see isRetryableAiError in
// lib/ai/retryableError.ts for exactly what counts as one).
const OPENAI_CHAT_MODEL_ID = "gpt-4o-mini";
// A Google-maintained alias ("whatever flash model is currently
// recommended"), not a pinned dated model — deliberately, after a pinned
// "gemini-2.5-flash" broke in production with "no longer available to new
// users" (a 404, not a deprecation warning). Re-verified 2026-08-31 against a
// real key: "gemini-2.5-flash" / "gemini-2.0-flash" both 404 ("no longer
// available"); "gemini-flash-latest" was returning 503 "high demand" on every
// call; "gemini-flash-lite-latest" returned real Hebrew replies 3/3. Lite is
// also cheaper/faster and more than enough for Atlas's short-generation
// workload (insights, goal breakdown, structured extraction). If the AI SDK
// starts erroring here again, check model availability with a direct REST
// call before assuming it's the key — see docs/BACKLOG.md.
const GEMINI_CHAT_MODEL_ID = "gemini-flash-lite-latest";
// Secondary aliases used only as failover links in the chain below. Both are
// Google-maintained aliases rather than pinned dated ids, for exactly the
// reason documented above.
const GEMINI_FALLBACK_MODEL_ID = "gemini-flash-latest";
const OPENAI_FALLBACK_MODEL_ID = "gpt-4o-mini";
const TRANSCRIPTION_MODEL_ID = "whisper-1";

function currentChatProvider(): ChatProvider {
  return resolveChatProvider({
    openaiKey: process.env.OPENAI_API_KEY,
    geminiKey: process.env.GEMINI_API_KEY,
  });
}

// Explicit apiKey wiring (not the SDK's own default GOOGLE_GENERATIVE_AI_API_KEY
// env var name) so the project's actual env var, GEMINI_API_KEY, is the one
// real source of truth — one name, documented once, in .env.example.
function getGoogleProvider() {
  return createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });
}

export function getChatModel() {
  // currentChatProvider() being null here means a caller invoked this
  // without first checking isProviderConfigured() — falling back to OpenAI
  // (which will itself fail loudly on a missing key) is more honest than
  // silently picking a provider nothing asked for.
  return currentChatProvider() === "gemini" ? getGoogleProvider()(GEMINI_CHAT_MODEL_ID) : openai(OPENAI_CHAT_MODEL_ID);
}

export interface ChatModelCandidate {
  /** For logging — which model actually served the request. */
  label: string;
  model: ReturnType<typeof openai>;
}

/**
 * The ordered failover chain (system-wide AI resiliency).
 *
 * A provider returning 503 "high demand" is a capacity problem, and the one
 * reliable cure is a different model — ideally on a different provider,
 * since an overloaded provider tends to be overloaded across its whole
 * fleet. So the chain crosses providers first when both keys exist, then
 * falls back to the same provider's alternate alias.
 *
 * Ordering keeps the current primary first, so nothing about the normal,
 * healthy path changes — this only ever engages after a real failure.
 */
export function getChatModelChain(): ChatModelCandidate[] {
  const provider = currentChatProvider();
  const hasOpenAi = Boolean(process.env.OPENAI_API_KEY);
  const hasGemini = Boolean(process.env.GEMINI_API_KEY);

  const openaiPrimary: ChatModelCandidate[] = hasOpenAi
    ? [{ label: `openai:${OPENAI_CHAT_MODEL_ID}`, model: openai(OPENAI_CHAT_MODEL_ID) }]
    : [];
  const geminiPrimary: ChatModelCandidate[] = hasGemini
    ? [{ label: `gemini:${GEMINI_CHAT_MODEL_ID}`, model: getGoogleProvider()(GEMINI_CHAT_MODEL_ID) }]
    : [];
  const geminiAlternate: ChatModelCandidate[] = hasGemini
    ? [{ label: `gemini:${GEMINI_FALLBACK_MODEL_ID}`, model: getGoogleProvider()(GEMINI_FALLBACK_MODEL_ID) }]
    : [];
  const openaiAlternate: ChatModelCandidate[] =
    hasOpenAi && OPENAI_FALLBACK_MODEL_ID !== OPENAI_CHAT_MODEL_ID
      ? [{ label: `openai:${OPENAI_FALLBACK_MODEL_ID}`, model: openai(OPENAI_FALLBACK_MODEL_ID) }]
      : [];

  const chain =
    provider === "gemini"
      ? [...geminiPrimary, ...openaiPrimary, ...geminiAlternate]
      : [...openaiPrimary, ...geminiPrimary, ...openaiAlternate, ...geminiAlternate];

  // Never hand back an empty chain: callers gate on isProviderConfigured(),
  // and an empty array would look like "succeeded with no result" rather
  // than failing loudly on a missing key.
  return chain.length > 0 ? chain : [{ label: `openai:${OPENAI_CHAT_MODEL_ID}`, model: openai(OPENAI_CHAT_MODEL_ID) }];
}

export function getTranscriptionModel() {
  return openai.transcription(TRANSCRIPTION_MODEL_ID);
}

// Every AI-backed route previously checked process.env.OPENAI_API_KEY
// directly before deciding whether to call a real model or fall back to an
// honest mock/template — real, working provider-coupling in a codebase
// otherwise disciplined about not leaking it. Routes ask this instead; it
// now reflects "is any chat-capable provider configured," OpenAI or Gemini.
export function isProviderConfigured(): boolean {
  return currentChatProvider() !== null;
}

// Audio transcription (Torah Space uploads) is OpenAI/Whisper-specific —
// @ai-sdk/google has no transcription model in this version, only
// text-to-speech (the opposite direction). Kept distinct from
// isProviderConfigured() so app/api/torah/extract's audio path gates on the
// capability it actually needs: a Gemini-only setup enables chat/text
// generation everywhere, but not audio transcription.
export function isTranscriptionConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}
