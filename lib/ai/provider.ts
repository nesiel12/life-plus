import "server-only";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

// The one place that knows which AI providers Atlas actually uses (Unified
// AI Provider Layer). Every model selection in lib/ai/service.ts comes from
// here — swapping/adding providers means changing this file (and, only if
// the new SDK's call shape genuinely differs, service.ts), never any of
// the AI-backed routes.
//
// Rebuilt 2026-09-25 around a fixed, explicit tier order rather than
// "whichever of two keys is set wins": Groq → Gemini (two models deep) →
// Cerebras → SambaNova → OpenRouter (a free model only — see its own
// section below), each an independent, skip-if-unconfigured link. Gemini
// sits second, immediately after Groq, rather than after Cerebras/
// SambaNova specifically because those two were live-confirmed 402
// "Payment Required" (no billing on file at either provider account) —
// no sense paying two guaranteed-to-fail network hops before reaching a
// tier that actually works; they stay wired in, lower priority, so they
// activate automatically the moment billing is added, no code change
// needed then. No Anthropic/Claude
// integration exists anywhere in this file, by design — Groq, Cerebras,
// SambaNova and OpenRouter are all "OpenAI-compatible" REST APIs (same
// request/response shape as OpenAI's own, different host), which is what
// makes a genuinely fast, free tier of providers usable through the one
// @ai-sdk/openai integration this file already depended on, via
// createOpenAI({ apiKey, baseURL }).chat(modelId) — .chat(), not the
// factory's default call, because @ai-sdk/openai defaults to OpenAI's own
// Responses API, which none of these four third-party hosts implement
// (live-confirmed 2026-09-25: both Cerebras and SambaNova specifically
// 400/404 with "Unsupported model ... on Response API" until forced onto
// the legacy Chat Completions endpoint via .chat()).
//
// Every model id below was chosen by querying each provider's own live
// /v1/models endpoint on 2026-09-25 and test-streaming the result — not
// carried over from memory or an earlier session. The previous Groq/
// Cerebras/SambaNova ids this app briefly used (llama-3.3-70b-versatile /
// llama3.1-70b / Meta-Llama-3.1-70B-Instruct) all 404 today; if this chain
// starts erroring again, re-run that same check
// (GET <baseURL>/models with the relevant key) before assuming the key or
// the code — see docs/BACKLOG.md.
const GROQ_CHAT_MODEL_ID = "openai/gpt-oss-20b";
const CEREBRAS_CHAT_MODEL_ID = "gpt-oss-120b";
const SAMBANOVA_CHAT_MODEL_ID = "Meta-Llama-3.3-70B-Instruct";

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
// [2026-09-24] Re-verified against the freshly-rotated key with direct REST
// calls (generateContent, not the SDK): "gemini-2.5-flash" and "gemini-2.0-
// flash" both 404 ("no longer available to new users"); "gemini-flash-
// latest" AND "gemini-flash-lite-latest" both 503 "high demand" on every
// call, consistently, not a one-off spike — the aliases now resolve to an
// old, saturated generation. "gemini-3.6-flash" and "gemini-3.5-flash" were
// the only models in the account's live ListModels response that returned
// real 200s, repeatedly.
const GEMINI_CHAT_MODEL_ID = "gemini-3.5-flash";
// A second, independently-verified-live model — not the same one twice, so
// a genuine outage (or a daily-quota exhaustion) of the primary actually
// has somewhere else to go, still within the Gemini tier.
const GEMINI_FALLBACK_MODEL_ID = "gemini-3.6-flash";

// OpenRouter is STRICTLY the last-resort backup, per explicit instruction —
// and, per that same instruction, only ever a free model: paid usage here
// would defeat the entire point of an app built around five separately-
// free provider tiers. isOpenRouterFreeModelId is a real, enforced guard
// (see getChatModelChain below), not just a naming convention — a model id
// that doesn't end in ":free" is refused rather than silently billed.
// google/gemma-4-31b-it:free is one of 20 free models OpenRouter's own
// live /v1/models listing carried on 2026-09-25 (the user's own suggested
// "meta-llama/llama-3-8b-instruct:free" no longer exists on that list —
// that family of ids has aged out) and, live-tested, answered fluently in
// Hebrew.
const OPENROUTER_FREE_CHAT_MODEL_ID = "google/gemma-4-31b-it:free";
export function isOpenRouterFreeModelId(modelId: string): boolean {
  return modelId.endsWith(":free");
}

const OPENAI_CHAT_MODEL_ID = "gpt-4o-mini";
const TRANSCRIPTION_MODEL_ID = "whisper-1";
// Bytez: see lib/ai/bytez.ts for why this is a direct REST call rather than
// an SDK-native model. Not part of the five tiers above (the user didn't
// configure it — BYTEZ_API_KEY is absent — and didn't ask for it), kept
// only as an opt-in tail candidate for if it's ever added: harmless when
// unset, since every candidate below is gated on its own key existing.
const BYTEZ_CHAT_MODEL_ID = "google/gemma-3-4b-it";

// Explicit apiKey wiring (not each SDK's own default env var name) so the
// project's actual env var names are the one real source of truth for each
// — one name per provider, documented once, in .env.example.
function getGoogleProvider() {
  return createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });
}
function getGroqProvider() {
  return createOpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" });
}
function getCerebrasProvider() {
  return createOpenAI({ apiKey: process.env.CEREBRAS_API_KEY, baseURL: "https://api.cerebras.ai/v1" });
}
function getSambaNovaProvider() {
  return createOpenAI({ apiKey: process.env.SAMBANOVA_API_KEY, baseURL: "https://api.sambanova.ai/v1" });
}
function getOpenRouterProvider() {
  return createOpenAI({ apiKey: process.env.OPENROUTER_API_KEY, baseURL: "https://openrouter.ai/api/v1" });
}

// A "sdk" candidate is called through generateText/generateObject/streamText
// exactly as before; a "bytez" candidate has no LanguageModel to hand those
// functions, so it carries only the model id and is called through
// lib/ai/bytez.ts instead — see the branch in each of lib/ai/service.ts's
// call sites.
export type ChatModelCandidate =
  | { kind: "sdk"; label: string; model: LanguageModel }
  | { kind: "bytez"; label: string; modelId: string };

/**
 * The ordered failover chain (system-wide AI resiliency) — five
 * independent, free-to-use tiers in the exact order requested (updated
 * 2026-09-25 once Cerebras/SambaNova's account-level 402s were confirmed
 * live): Groq → Gemini (two models deep) → Cerebras → SambaNova →
 * OpenRouter (a free model, strictly last resort). Each tier is included
 * only when its own env var is actually set — an unconfigured provider is
 * skipped, not a failure. OpenAI and Bytez, if ever configured, are
 * appended between SambaNova and OpenRouter as extra tail candidates
 * rather than removed from the app's capabilities entirely — OpenRouter
 * stays last regardless, per its own "strictly last resort" requirement.
 *
 * A capacity failure (503, 429, and — live-confirmed 2026-09-25 — 402
 * "payment required" on a provider account with no billing configured) on
 * one tier moves to the next; see lib/ai/retryableError.ts for exactly
 * what counts as one. This function itself does no retrying — it just
 * builds the ordered list; lib/ai/service.ts's withModelFallback and
 * streamChatReply are what actually walk it.
 */
export function getChatModelChain(): ChatModelCandidate[] {
  const chain: ChatModelCandidate[] = [];

  if (process.env.GROQ_API_KEY) {
    chain.push({ kind: "sdk", label: `groq:${GROQ_CHAT_MODEL_ID}`, model: getGroqProvider().chat(GROQ_CHAT_MODEL_ID) });
  }
  if (process.env.GEMINI_API_KEY) {
    chain.push({ kind: "sdk", label: `gemini:${GEMINI_CHAT_MODEL_ID}`, model: getGoogleProvider()(GEMINI_CHAT_MODEL_ID) });
    chain.push({ kind: "sdk", label: `gemini:${GEMINI_FALLBACK_MODEL_ID}`, model: getGoogleProvider()(GEMINI_FALLBACK_MODEL_ID) });
  }
  if (process.env.CEREBRAS_API_KEY) {
    chain.push({ kind: "sdk", label: `cerebras:${CEREBRAS_CHAT_MODEL_ID}`, model: getCerebrasProvider().chat(CEREBRAS_CHAT_MODEL_ID) });
  }
  if (process.env.SAMBANOVA_API_KEY) {
    chain.push({ kind: "sdk", label: `sambanova:${SAMBANOVA_CHAT_MODEL_ID}`, model: getSambaNovaProvider().chat(SAMBANOVA_CHAT_MODEL_ID) });
  }
  if (process.env.BYTEZ_API_KEY) {
    chain.push({ kind: "bytez", label: `bytez:${BYTEZ_CHAT_MODEL_ID}`, modelId: BYTEZ_CHAT_MODEL_ID });
  }
  if (process.env.OPENAI_API_KEY) {
    chain.push({ kind: "sdk", label: `openai:${OPENAI_CHAT_MODEL_ID}`, model: openai(OPENAI_CHAT_MODEL_ID) });
  }
  if (process.env.OPENROUTER_API_KEY) {
    // The enforced guard named in this constant's own comment: refuses to
    // wire in an OpenRouter model that isn't free, rather than silently
    // billing the account the instant someone changes this one constant.
    if (!isOpenRouterFreeModelId(OPENROUTER_FREE_CHAT_MODEL_ID)) {
      throw new Error(`[ai] OPENROUTER_FREE_CHAT_MODEL_ID ("${OPENROUTER_FREE_CHAT_MODEL_ID}") is not a free model id (must end in ":free")`);
    }
    chain.push({ kind: "sdk", label: `openrouter:${OPENROUTER_FREE_CHAT_MODEL_ID}`, model: getOpenRouterProvider().chat(OPENROUTER_FREE_CHAT_MODEL_ID) });
  }

  return chain;
}

export function getTranscriptionModel() {
  return openai.transcription(TRANSCRIPTION_MODEL_ID);
}

// Every AI-backed route previously checked process.env.OPENAI_API_KEY
// directly before deciding whether to call a real model or fall back to an
// honest mock/template — real, working provider-coupling in a codebase
// otherwise disciplined about not leaking it. Routes ask this instead.
// Single source of truth with getChatModelChain() itself (not a separate
// "which keys count" list that could drift from it): any provider that
// chain would actually try counts as configured.
export function isProviderConfigured(): boolean {
  return getChatModelChain().length > 0;
}

// Audio transcription (Torah Space uploads) is OpenAI/Whisper-specific —
// @ai-sdk/google has no transcription model in this version, only
// text-to-speech (the opposite direction), and none of Groq/Cerebras/
// SambaNova/OpenRouter's chat-completions-shaped integration above expose
// one either. Kept distinct from isProviderConfigured() so app/api/torah/
// extract's audio path gates on the capability it actually needs.
export function isTranscriptionConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

// Lesson media (uploaded shiurim, YouTube videos) is transcribed by Gemini,
// which reads audio and video directly — see lib/ai/geminiMedia.ts. Distinct
// from isTranscriptionConfigured(), which is the Whisper path.
export function isMediaTranscriptionConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}
