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

/**
 * An Error carrying a message that is always safe to show as-is — either
 * the server's own Hebrew explanation (a quota message with its real reset
 * time, say) or readAiError's generic fallback, never raw JS/network text
 * ("Failed to fetch", an AbortError's message, a stack trace).
 *
 * Exists because of a real, live bug (2026-09-25): a component would call
 * readAiError correctly, throw new Error(info.message) with the real
 * reason, and then its own outer `catch` — written before readAiError
 * existed, catching genuine network failures too — couldn't tell that
 * message apart from an opaque one, and showed the same generic fallback
 * text regardless. A user hitting their daily AI quota saw "לא הצלחתי
 * להתחבר כרגע. נסה שוב עוד רגע" (implying an immediate retry might help)
 * instead of the real, more useful "מיצית את המכסה... מתחדשת ב-03:00" the
 * server had already computed and sent. `instanceof AiFetchError` is how
 * a catch block now tells the two apart.
 */
export class AiFetchError extends Error {
  readonly quotaExceeded: boolean;
  readonly resetAt: Date | null;

  constructor(info: AiErrorInfo) {
    super(info.message);
    this.name = "AiFetchError";
    this.quotaExceeded = info.quotaExceeded;
    this.resetAt = info.resetAt;
  }
}

/** Reads a failed response and throws it as an AiFetchError — the one call a component's `if (!res.ok)` branch needs. */
export async function throwAiError(res: Response, fallback = GENERIC): Promise<never> {
  throw new AiFetchError(await readAiError(res, fallback));
}
