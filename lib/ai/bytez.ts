import "server-only";
import type { z } from "zod";

// Bytez REST client — chat and structured-output generation only.
//
// Bytez has no official Vercel AI SDK provider package (there is no
// @ai-sdk/bytez; checked the npm registry and the AI SDK's own provider
// list before writing this), so it cannot be dropped into generateText/
// generateObject as a LanguageModel the way OpenAI and Gemini are in
// lib/ai/provider.ts. This calls Bytez's own REST API directly rather than
// pulling in their bytez.js SDK as a second dependency whose error
// semantics would need to be learned separately — a plain fetch is the
// simpler, more inspectable choice, and it's what lets every failure be
// shaped to match what the rest of this app already expects (see below).
//
// Endpoint and request shape: POST https://api.bytez.com/models/v2/{model},
// Authorization: <key>, and — per Bytez's own integration docs — a
// `messages` array formatted the same way as OpenAI's chat completions,
// with prompt formatting handled on their side.

const BYTEZ_BASE_URL = "https://api.bytez.com/models/v2";

// Bytez bills open-model inference per second, not per token or per
// request, so a slow model is a slow *bill* as well as a slow reply. This
// bound exists for the same reason GENERATION_TIMEOUT_MS exists in
// service.ts: a provider that accepts the connection and then stalls must
// fail over to the next model in the chain, never hang the request.
const BYTEZ_TIMEOUT_MS = 30_000;

interface BytezChatMessage {
  role: "system" | "user";
  content: string;
}

async function callBytez(modelId: string, messages: BytezChatMessage[]): Promise<string> {
  const apiKey = process.env.BYTEZ_API_KEY;
  if (!apiKey) {
    // A caller reached this without checking configuration first — a
    // programming error, not a capacity failure. Thrown with no `.status`
    // and no retryable-looking text, so isRetryableAiError correctly
    // refuses to retry it: every model in the chain would fail identically
    // on a missing key, and retrying just delays the same error.
    throw new Error("BYTEZ_API_KEY is not configured.");
  }

  const res = await fetch(`${BYTEZ_BASE_URL}/${modelId}`, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages }),
    // A native fetch rejection (DNS failure, connection refused, the
    // signal firing) surfaces as a plain Error whose message already
    // contains wording like "fetch failed" or "aborted" — both already in
    // retryableError.ts's RETRYABLE_TEXT list, so nothing Bytez-specific
    // is needed to classify that case.
    signal: AbortSignal.timeout(BYTEZ_TIMEOUT_MS),
  });

  const bodyText = await res.text();

  if (!res.ok) {
    // The exact convention statusOf() in lib/ai/retryableError.ts already
    // reads from every other provider's thrown error. Attaching it here —
    // and nowhere else — is what "reuse the existing fallback
    // architecture" means in practice: the shared predicate classifies a
    // Bytez failure correctly with zero Bytez-specific code added to it.
    throw Object.assign(new Error(bodyText || res.statusText || `Bytez request failed (${res.status})`), {
      status: res.status,
    });
  }

  let parsed: { output?: unknown; error?: unknown };
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    throw new Error(`Bytez returned a non-JSON response: ${bodyText.slice(0, 200)}`);
  }

  if (parsed.error) {
    // Bytez's own SDK reports some failure classes as { error, output }
    // rather than a non-2xx status. Surfaced as a plain message so the
    // text half of isRetryableAiError still gets a chance to recognise
    // capacity wording ("rate limit", "quota", …) even when the HTTP
    // transport itself reported success.
    throw new Error(typeof parsed.error === "string" ? parsed.error : JSON.stringify(parsed.error));
  }

  const output = parsed.output;
  if (typeof output === "string") return output;
  // Some chat models on Bytez return { output: { content: "…" } } rather
  // than a bare string. Reading through one level rather than failing on a
  // shape variance that isn't actually a failure.
  if (output && typeof output === "object") {
    const record = output as Record<string, unknown>;
    const content = record.content ?? record.text;
    if (typeof content === "string") return content;
  }

  throw new Error(`Bytez returned an unexpected response shape: ${bodyText.slice(0, 200)}`);
}

export async function bytezGenerateText(params: {
  modelId: string;
  system: string;
  prompt: string;
}): Promise<string> {
  return callBytez(params.modelId, [
    { role: "system", content: params.system },
    { role: "user", content: params.prompt },
  ]);
}

/**
 * Structured output via prompting, not native schema enforcement.
 *
 * Bytez's chat endpoint has no documented equivalent to OpenAI/Gemini's
 * structured-output mode (tool calling / response_format), so the schema is
 * described in the prompt and the reply is parsed and validated the same
 * way any free-text model has to be coerced into JSON.
 *
 * A parse or validation failure here is thrown deliberately *without* a
 * `.status` and with no retryable-looking wording. It means this specific
 * model could not produce the shape asked for — a correctness failure, not
 * one of the task's own closed list of retryable conditions (quota
 * exhaustion, rate limits, 5xx, timeout, network errors) — so it is not
 * retried. A different model failing to hold a schema is a real, distinct
 * problem from a provider being briefly overloaded, and silently retrying
 * it would paper over model-quality gaps this code has no business hiding.
 */
export async function bytezGenerateObject<T extends z.ZodTypeAny>(params: {
  modelId: string;
  system: string;
  prompt: string;
  schema: T;
}): Promise<z.infer<T>> {
  const jsonSystem = `${params.system}\n\nהשב אך ורק ב-JSON תקין התואם למבנה המבוקש. אל תוסיף טקסט, הסברים או עטיפת Markdown סביב ה-JSON.`;
  const raw = await callBytez(params.modelId, [
    { role: "system", content: jsonSystem },
    { role: "user", content: params.prompt },
  ]);

  let candidate: unknown;
  try {
    // A model told "JSON only" still sometimes wraps it in a ```json
    // fence — stripping one is cheap insurance against a near-miss that
    // has nothing to do with whether the model actually reasoned correctly.
    const stripped = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "");
    candidate = JSON.parse(stripped);
  } catch {
    throw new Error(`Bytez did not return valid JSON: ${raw.slice(0, 200)}`);
  }

  return params.schema.parse(candidate);
}
