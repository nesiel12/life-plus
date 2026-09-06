"use client";

// Reading an AI error response on the client.
//
// Every AI route already returns `{ error }`, and most components render that
// string, so a quota message reaches the user without any change. Two things
// this adds:
//
//   1. The streaming routes never read the body at all — `if (!res.ok)
//      throw new Error("chat failed")` — so a 429 explaining the quota was
//      being replaced by a generic failure. The one place the user is most
//      likely to hit a limit was the one place the reason was discarded.
//   2. `quotaExceeded` lets a component present exhaustion differently from
//      a genuine fault. Keyed on the machine-readable `code`, not on the
//      message text or the bare status: the burst limiter also returns 429
//      and means something else ("slow down", not "you are done for today").

export interface AiErrorInfo {
  message: string;
  quotaExceeded: boolean;
  /** When the exhausted budget refills, if the server said. */
  resetAt: Date | null;
}

const GENERIC = "משהו השתבש. נסה שוב.";

/**
 * Extracts a user-facing error from a failed AI response.
 *
 * Never throws: it is called on an error path, and a parse failure there
 * would replace a useful message with a stack trace.
 */
export async function readAiError(res: Response, fallback = GENERIC): Promise<AiErrorInfo> {
  let body: { error?: unknown; code?: unknown; resetAt?: unknown } = {};
  try {
    body = await res.json();
  } catch {
    // Streaming routes can fail before emitting valid JSON.
  }

  const quotaExceeded = body.code === "quota_exceeded";
  const resetRaw = typeof body.resetAt === "string" ? new Date(body.resetAt) : null;

  return {
    message: typeof body.error === "string" && body.error.trim() ? body.error : fallback,
    quotaExceeded,
    resetAt: resetRaw && !Number.isNaN(resetRaw.getTime()) ? resetRaw : null,
  };
}
