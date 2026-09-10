import "server-only";
import { openai } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
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
// Second fallback, between Gemini and OpenAI — see lib/ai/bytez.ts for why
// this is a direct REST call rather than an SDK-native model.
//
// Bytez has no distinct "free models" tier: it bills all open-model
// inference by the second (docs.bytez.com/model-api/docs/billing), with a
// small rolling credit allowance ($1 / 4 weeks on the free plan) that any
// model draws down, scaled by parameter count — a 7B-class model runs
// roughly $0.26/hour, a 120B one roughly five times that. Gemma 3 4B is
// below even the 7B tier, is genuinely capable as an assistant model for
// its size, and is confirmed as an actual, currently-integrated Bytez
// model (docs.litellm.ai/docs/providers/bytez uses this exact id as their
// own worked example) — cheap enough that this fallback tier does not
// meaningfully eat into a free-tier account's rolling allowance.
const BYTEZ_CHAT_MODEL_ID = "google/gemma-3-4b-it";

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

export function getChatModel(): LanguageModel {
  // currentChatProvider() being null here means a caller invoked this
  // without first checking isProviderConfigured() — falling back to OpenAI
  // (which will itself fail loudly on a missing key) is more honest than
  // silently picking a provider nothing asked for.
  //
  // Bytez deliberately never appears here. This is the single-model picker
  // streamChatReply uses (see its own comment for why streaming has no
  // mid-request failover), and Bytez is meant strictly as a fallback tier
  // inside getChatModelChain() below, never a top-level primary choice.
  return currentChatProvider() === "gemini" ? getGoogleProvider()(GEMINI_CHAT_MODEL_ID) : openai(OPENAI_CHAT_MODEL_ID);
}

// A "sdk" candidate is called through generateText/generateObject exactly
// as before; a "bytez" candidate has no LanguageModel to hand those
// functions, so it carries only the model id and is called through
// lib/ai/bytez.ts instead — see the branch in each of
// lib/ai/service.ts's withModelFallback call sites.
export type ChatModelCandidate =
  | { kind: "sdk"; label: string; model: LanguageModel }
  | { kind: "bytez"; label: string; modelId: string };

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
  const hasBytez = Boolean(process.env.BYTEZ_API_KEY);

  const openaiPrimary: ChatModelCandidate[] = hasOpenAi
    ? [{ kind: "sdk", label: `openai:${OPENAI_CHAT_MODEL_ID}`, model: openai(OPENAI_CHAT_MODEL_ID) }]
    : [];
  const geminiPrimary: ChatModelCandidate[] = hasGemini
    ? [{ kind: "sdk", label: `gemini:${GEMINI_CHAT_MODEL_ID}`, model: getGoogleProvider()(GEMINI_CHAT_MODEL_ID) }]
    : [];
  const geminiAlternate: ChatModelCandidate[] = hasGemini
    ? [{ kind: "sdk", label: `gemini:${GEMINI_FALLBACK_MODEL_ID}`, model: getGoogleProvider()(GEMINI_FALLBACK_MODEL_ID) }]
    : [];
  const openaiAlternate: ChatModelCandidate[] =
    hasOpenAi && OPENAI_FALLBACK_MODEL_ID !== OPENAI_CHAT_MODEL_ID
      ? [{ kind: "sdk", label: `openai:${OPENAI_FALLBACK_MODEL_ID}`, model: openai(OPENAI_FALLBACK_MODEL_ID) }]
      : [];
  // The middle tier: "Gemini primary, Bytez second, OpenAI final" per the
  // requested ordering. Included in the openai-primary branch too (only
  // reached when Gemini's own key is absent) so a Gemini outage does not
  // also remove Atlas's only other cross-provider fallback — it slots in
  // right after whichever provider is actually primary, before that
  // branch's within-provider alternates, matching the existing "cross
  // providers before falling back within one" ordering below.
  const bytez: ChatModelCandidate[] = hasBytez
    ? [{ kind: "bytez", label: `bytez:${BYTEZ_CHAT_MODEL_ID}`, modelId: BYTEZ_CHAT_MODEL_ID }]
    : [];

  const chain =
    provider === "gemini"
      ? [...geminiPrimary, ...bytez, ...openaiPrimary, ...geminiAlternate]
      : [...openaiPrimary, ...bytez, ...geminiPrimary, ...openaiAlternate, ...geminiAlternate];

  // Never hand back an empty chain: callers gate on isProviderConfigured(),
  // and an empty array would look like "succeeded with no result" rather
  // than failing loudly on a missing key.
  return chain.length > 0
    ? chain
    : [{ kind: "sdk", label: `openai:${OPENAI_CHAT_MODEL_ID}`, model: openai(OPENAI_CHAT_MODEL_ID) }];
}

export type TranscriptionBackend = "gemini" | "whisper";

/**
 * How to transcribe audio, in priority order, based on which keys exist.
 *
 * Gemini goes first — it is this app's primary provider, its flash models
 * take audio natively, and it means transcription works on a Gemini-only
 * deployment (the common case: OPENAI_API_KEY is often blank). Whisper is
 * the fallback when an OpenAI key is configured. Empty → transcription is
 * genuinely unavailable and the route says so.
 */
export function transcriptionPlan(): TranscriptionBackend[] {
  const plan: TranscriptionBackend[] = [];
  if (process.env.GEMINI_API_KEY) plan.push("gemini");
  if (process.env.OPENAI_API_KEY) plan.push("whisper");
  return plan;
}

/** A Gemini model that accepts an audio file part alongside a prompt. */
export function getGeminiAudioModel(): LanguageModel {
  return getGoogleProvider()(GEMINI_CHAT_MODEL_ID);
}

export const WHISPER_MODEL_ID = TRANSCRIPTION_MODEL_ID;

// Every AI-backed route previously checked process.env.OPENAI_API_KEY
// directly before deciding whether to call a real model or fall back to an
// honest mock/template — real, working provider-coupling in a codebase
// otherwise disciplined about not leaking it. Routes ask this instead; it
// now reflects "is any chat-capable provider configured," OpenAI or Gemini.
export function isProviderConfigured(): boolean {
  return currentChatProvider() !== null;
}

// Audio transcription works whenever ANY audio-capable provider is
// configured — Gemini (native audio input) or OpenAI Whisper. Kept distinct
// from isProviderConfigured() only so a route can give a precise "no
// transcription backend" message; in practice a Gemini chat key is also a
// transcription key.
export function isTranscriptionConfigured(): boolean {
  return transcriptionPlan().length > 0;
}
