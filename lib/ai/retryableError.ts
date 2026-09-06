// Deciding whether an AI call failure is worth retrying on a different model.
//
// Pure and separately testable, following the same "pure module the
// server-only file imports from" split resolveChatProvider.ts already uses.
//
// The distinction that matters: a *capacity* failure (the provider is busy,
// rate-limited, or the model is momentarily overloaded) will very likely
// succeed on a different model, so failing over is right. A *correctness*
// failure — a bad API key, a malformed request, a schema the model cannot
// satisfy — will fail identically on every model in the chain, so retrying
// just multiplies the latency before the user sees the same error. Retrying
// everything is how a 3-second failure becomes a 90-second one.

/** HTTP statuses that mean "try again, possibly elsewhere". */
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

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
  const status = statusOf(error);
  if (status !== null) {
    if (FATAL_STATUS.has(status)) return false;
    if (RETRYABLE_STATUS.has(status)) return true;
  }

  const text = textOf(error);
  return RETRYABLE_TEXT.some((needle) => text.includes(needle));
}
