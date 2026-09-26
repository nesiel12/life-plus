// Deciding whether an AI call failure is worth retrying on a different model.
//
// Pure and separately testable, the same "pure module the server-only file
// imports from" split this codebase uses elsewhere (e.g.
// lib/goals/deriveGoalStage.ts).
//
// The distinction that matters: a *capacity* failure (the provider is busy,
// rate-limited, or the model is momentarily overloaded) will very likely
// succeed on a different model, so failing over is right. A *correctness*
// failure — a bad API key, a malformed request, a schema the model cannot
// satisfy — will fail identically on every model in the chain, so retrying
// just multiplies the latency before the user sees the same error. Retrying
// everything is how a 3-second failure becomes a 90-second one.

/**
 * HTTP statuses that mean "try again, possibly elsewhere".
 *
 * 402 added 2026-09-25, live-confirmed against real Cerebras/SambaNova
 * accounts: "Payment Required" means THAT provider's account has no billing
 * configured — a fact specific to that one account, unlike a 400/401 (a
 * malformed request or bad key, which fails identically everywhere). A
 * different provider in the chain knows nothing about this account's
 * billing status and is very much worth trying.
 */
const RETRYABLE_STATUS = new Set([402, 408, 409, 425, 429, 500, 502, 503, 504]);

/** Statuses that will fail the same way on every model — never retry. */
const FATAL_STATUS = new Set([400, 401, 403, 404, 422]);

// Substrings seen in real provider errors that indicate capacity rather than
// a caller mistake. Gemini's overload surfaces as "high demand" text, and
// AbortSignal.timeout produces a TimeoutError whose message mentions
// timeout — both are worth another model.
const RETRYABLE_TEXT = [
  "high demand",
  "overloaded",
  "capacity",
  "rate limit",
  "rate_limit",
  "too many requests",
  // Quota/billing exhaustion. Both providers actually surface this as HTTP
  // 429 (already retryable via RETRYABLE_STATUS above) — OpenAI's JSON body
  // carries error.code "insufficient_quota", Gemini's gRPC status name is
  // RESOURCE_EXHAUSTED. Listed explicitly anyway, as a safety net for an SDK
  // wrapper that loses the numeric status and leaves only the message text.
  "quota",
  "insufficient_quota",
  "resource_exhausted",
  "timeout",
  "timed out",
  "aborted",
  "econnreset",
  "etimedout",
  "socket hang up",
  "fetch failed",
  "service unavailable",
  "temporarily unavailable",
  "try again",
];

// A provider's OWN structured-output validator rejecting the JSON schema
// shape — an unsupported "format" keyword, an .optional() field it insists
// must still be listed in `required` — is a PROVIDER-SPECIFIC
// incompatibility, not a statement about the request being genuinely
// malformed. A different provider's structured-output validator can, and
// in practice does, accept the identical schema; the AI SDK's own zod→
// JSON-schema conversion is one shared shape handed to every provider, and
// each provider's own "strict mode" rules vary. Live-confirmed 2026-09-25
// against Groq, twice, for two different schema quirks in the exact same
// masterclass-lesson schema (see lib/validations/learning.ts's fix for the
// first). Always a 400 — see isRetryableAiError for why that status is
// checked here, ahead of the blanket "400 is fatal" rule below, instead of
// through the plain RETRYABLE_TEXT list.
const SCHEMA_INCOMPATIBILITY_TEXT = ["invalid json schema", "response_format", "unsupported string format", "unsupported_format"];

// A distinct failure mode from the above: the schema itself was accepted,
// but the model's own generated CONTENT violated one of its constraints
// (maxItems, maxLength, an enum value it invented) — Groq validates this
// server-side and 400s instead of just returning the bad JSON. Live-caught
// 2026-09-25 auditing the task/calendar/learning-lab agents: a "research"
// TaskAssist reply produced 11 considerations against a max(6), and — before
// this fix — that alone killed the whole fallover chain with a fatal 400
// instead of ever reaching Gemini. Same reasoning as SCHEMA_INCOMPATIBILITY_
// TEXT applies: one model's sampling overshooting a constraint says nothing
// about whether the next model in the chain will too, so it is worth
// advancing rather than surfacing to the user immediately.
const SCHEMA_VALIDATION_CONTENT_TEXT = ["does not match the expected schema", "json_validate_failed", "does not validate"];

function statusOf(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const e = error as Record<string, unknown>;
  for (const key of ["statusCode", "status"]) {
    const value = e[key];
    if (typeof value === "number") return value;
  }
  // The AI SDK nests the upstream response on some error shapes.
  const response = e.response;
  if (typeof response === "object" && response !== null) {
    const status = (response as Record<string, unknown>).status;
    if (typeof status === "number") return status;
  }
  return null;
}

function textOf(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`.toLowerCase();
  if (typeof error === "string") return error.toLowerCase();
  if (typeof error === "object" && error !== null) {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string") return message.toLowerCase();
  }
  return "";
}

/**
 * True when this failure is worth retrying on a different model.
 *
 * Status wins over text when present: a 401 whose message happens to contain
 * "try again" is still a dead key, and retrying it on every model in the
 * chain would turn one fast, clear auth error into a slow, confusing one.
 */
export function isRetryableAiError(error: unknown): boolean {
  const text = textOf(error);

  // Checked first, ahead of the blanket "400 is fatal" rule right below —
  // see SCHEMA_INCOMPATIBILITY_TEXT's own comment for why this specific
  // class of 400 is the one exception to "a 400 fails the same way on
  // every model".
  if (SCHEMA_INCOMPATIBILITY_TEXT.some((needle) => text.includes(needle))) return true;
  if (SCHEMA_VALIDATION_CONTENT_TEXT.some((needle) => text.includes(needle))) return true;

  const status = statusOf(error);
  if (status !== null) {
    if (FATAL_STATUS.has(status)) return false;
    if (RETRYABLE_STATUS.has(status)) return true;
  }

  return RETRYABLE_TEXT.some((needle) => text.includes(needle));
}
