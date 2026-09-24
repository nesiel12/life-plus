import "server-only";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

// A standalone, zero-downtime text-generation utility — deliberately
// separate from lib/ai/service.ts, this app's existing AI layer (quota
// tracking, actor billing, schema-guided structured generation, image
// input) that every current route already depends on. That layer isn't
// touched by this file; nothing here is wired into it, and nothing it
// already does is duplicated or replaced. This is unmetered by design: it
// has no notion of a calling user's quota, so it's for server-side/tooling
// use, not a route an end user can call directly and use to bypass the
// budget lib/ai/quota.ts enforces elsewhere.
//
// "server-only" (also true of every provider's API key never being
// readable client-side regardless) makes importing this from a Client
// Component a build error rather than a runtime leak.

export interface GenerateTextOptions {
  systemPrompt?: string;
}

interface Provider {
  name: string;
  call: (prompt: string, systemPrompt?: string) => Promise<string>;
}

/** Groq, GitHub Models, OpenRouter, Cerebras, and SambaNova are all OpenAI-compatible — one client shape, a different baseURL/model per provider. */
function openAiCompatibleProvider(name: string, apiKey: string | undefined, baseURL: string, model: string): Provider | null {
  if (!apiKey) return null;
  return {
    name,
    async call(prompt, systemPrompt) {
      const client = new OpenAI({ apiKey, baseURL });
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
      if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
      messages.push({ role: "user", content: prompt });

      const completion = await client.chat.completions.create({ model, messages });
      const text = completion.choices[0]?.message?.content;
      if (!text) throw new Error(`${name} returned an empty response`);
      return text;
    },
  };
}

/** Gemini uses the official Google SDK, not the OpenAI-compatible shape the others share. */
function geminiProvider(apiKey: string | undefined, model: string): Provider | null {
  if (!apiKey) return null;
  return {
    name: "Gemini",
    async call(prompt, systemPrompt) {
      const client = new GoogleGenerativeAI(apiKey);
      const genModel = client.getGenerativeModel({ model, ...(systemPrompt ? { systemInstruction: systemPrompt } : {}) });
      const result = await genModel.generateContent(prompt);
      const text = result.response.text();
      if (!text) throw new Error("Gemini returned an empty response");
      return text;
    },
  };
}

// Built fresh per call rather than once at module load: cheap (just object
// construction, no network), and avoids any question of a client
// constructed from an env var that wasn't set yet at import time.
function buildProviderChain(): Provider[] {
  const providers = [
    openAiCompatibleProvider("Groq", process.env.GROQ_API_KEY, "https://api.groq.com/openai/v1", "llama-3.3-70b-versatile"),
    // Live-verified 2026-09-24 (see lib/ai/provider.ts): "gemini-2.0-flash"
    // 404s as "no longer available to new users" against a fresh key.
    // "gemini-3.5-flash", not "gemini-3.6-flash": 2026-09-25, "gemini-3.6-
    // flash" was confirmed to carry its own separate 20-requests/day
    // free-tier cap (live 429 body), and this module has no per-model
    // fallback of its own — a single call here against an exhausted or
    // slow "thinking" model just fails, so it leads with the one that
    // live-measured faster and wasn't the one this app's own testing had
    // already exhausted (see lib/ai/provider.ts for the full comparison).
    geminiProvider(process.env.GEMINI_API_KEY, "gemini-3.5-flash"),
    openAiCompatibleProvider("GitHub Models", process.env.GITHUB_TOKEN, "https://models.inference.ai.azure.com", "gpt-4o-mini"),
    openAiCompatibleProvider("OpenRouter", process.env.OPENROUTER_API_KEY, "https://openrouter.ai/api/v1", "meta-llama/llama-3.3-70b-instruct:free"),
    openAiCompatibleProvider("Cerebras", process.env.CEREBRAS_API_KEY, "https://api.cerebras.ai/v1", "llama3.1-70b"),
    openAiCompatibleProvider("SambaNova", process.env.SAMBANOVA_API_KEY, "https://api.sambanova.ai/v1", "Meta-Llama-3.1-70B-Instruct"),
  ];
  return providers.filter((p): p is Provider => p !== null);
}

function describeError(err: unknown): string {
  if (err instanceof OpenAI.APIError) {
    return `${err.status ?? "?"} ${err.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}

/**
 * Generates text from the first provider in the fallback chain that
 * succeeds — Groq, then Gemini, GitHub Models, OpenRouter, Cerebras,
 * SambaNova, in that fixed order. A provider that isn't configured (no API
 * key in the environment) is skipped silently, not counted as a failure;
 * a configured provider that throws (rate limit, quota exhaustion, a 5xx,
 * a timeout, anything) is logged with a warning naming the provider and
 * the error, and the chain moves on to the next one immediately.
 *
 * Throws only if every configured provider fails (or none are configured
 * at all), with every individual failure included in the message.
 */
export async function generateText(prompt: string, options?: GenerateTextOptions): Promise<string> {
  const providers = buildProviderChain();
  if (providers.length === 0) {
    throw new Error(
      "generateText: no AI provider is configured — set at least one of GROQ_API_KEY, GEMINI_API_KEY, GITHUB_TOKEN, OPENROUTER_API_KEY, CEREBRAS_API_KEY, SAMBANOVA_API_KEY."
    );
  }

  const failures: string[] = [];
  for (const provider of providers) {
    try {
      return await provider.call(prompt, options?.systemPrompt);
    } catch (err) {
      const reason = describeError(err);
      console.warn(`[ai-service] ${provider.name} failed (${reason}) — falling back to the next provider.`);
      failures.push(`${provider.name}: ${reason}`);
    }
  }

  throw new Error(`generateText: every configured AI provider failed.\n${failures.join("\n")}`);
}
