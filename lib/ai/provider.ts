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
// Pinned to a dated model, not a Google-maintained "-latest"/"-lite-latest"
// alias, for the reasons in the 2026-09-24 half of this comment below.
//
// 2026-09-25 update — swapped which of the two goes primary, after two
// further live findings against the same key:
//
// 1. "gemini-3.6-flash" (this constant's value until today) carries its own
//    separate free-tier cap of 20 requests/DAY — confirmed via the live
//    429 body: `"quotaId": "GenerateRequestsPerDayPerProjectPerModel-
//    FreeTier", "quotaDimensions": {"model": "gemini-3.6-flash"}, "quota
//    Value": "20"`. Ordinary chat usage (this session's own diagnostics
//    included) exhausts that in minutes, at which point every chat message
//    silently failed — see lib/ai/service.ts's streamChatReply for the
//    other half of that incident (the SDK not throwing on an exhausted
//    stream). "gemini-3.5-flash" was NOT exhausted at the same time,
//    despite equivalent testing load, so its own daily cap is evidently
//    higher (unconfirmed exact number — Google doesn't expose it until you
//    hit it).
// 2. "gemini-3.6-flash" defaults to a "thinking" mode with 20+ seconds to
//    the FIRST streamed chunk on a trivial prompt — measured live. That is
//    most of this app's own STREAM_TIMEOUT_MS budget spent before a single
//    byte reaches the person waiting. "gemini-3.5-flash" answered the same
//    prompt in ~4s with no special configuration. (streamChatReply also
//    now explicitly sets thinkingBudget: 0 for whichever of the two ends up
//    a "thinking" model, cutting "gemini-3.6-flash" alone to ~5-7s — still
//    behind "gemini-3.5-flash" with no config needed at all.)
//
// "gemini-3.5-flash" as primary is the fix for both: faster by default, and
// not the model this app's own testing has already burned through a tiny
// daily allowance on. "gemini-3.6-flash" stays configured as the fallback
// — still a live, real, working model, just not the one to lead with.
//
// [2026-09-24] Re-verified against the freshly-rotated key with direct REST
// calls (generateContent, not the SDK): "gemini-2.5-flash" and "gemini-2.0-
// flash" both 404 ("no longer available to new users"); "gemini-flash-
// latest" AND "gemini-flash-lite-latest" both 503 "high demand" on every
// call, consistently, not a one-off spike — the aliases now resolve to an
// old, saturated generation. "gemini-3.6-flash" and "gemini-3.5-flash" were
// the only models in the account's live ListModels response that returned
// real 200s, repeatedly. If this starts erroring again, don't assume the
// key — re-run ListModels
// (https://generativelanguage.googleapis.com/v1beta/models?key=…) and a
// direct generateContent call against a few candidates before touching
// anything else; see docs/BACKLOG.md.
const GEMINI_CHAT_MODEL_ID = "gemini-3.5-flash";
// A second, independently-verified-live model — not the same one twice, so
// a genuine outage (or, as of 2026-09-25, a daily-quota exhaustion) of the
// primary actually has somewhere else to go.
const GEMINI_FALLBACK_MODEL_ID = "gemini-3.6-flash";
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

// Lesson media (uploaded shiurim, YouTube videos) is transcribed by Gemini,
// which reads audio and video directly — see lib/ai/geminiMedia.ts. Distinct
// from isTranscriptionConfigured(), which is the Whisper path.
export function isMediaTranscriptionConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}
