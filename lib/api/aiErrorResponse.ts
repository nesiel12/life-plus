import { NextResponse } from "next/server";
import { AiQuotaExceededError } from "@/lib/ai/service";

// Turning an AI failure into a response.
//
// The reason this exists rather than each route writing its own catch: a
// user who has spent their free allowance has done nothing wrong, and the
// generic "something went wrong" every AI route returns on error tells them
// nothing about what happened or when it clears. Quota exhaustion is a
// distinct, expected, temporary state and has to read as one.
//
// The shape is deliberate. `code: "quota_exceeded"` is what the client keys
// off — matching on the message string would break the moment the Hebrew is
// reworded, and matching on the 429 alone would conflate this with the
// in-memory burst limiter, which means something different ("slow down"
// rather than "you are done for today").

export interface AiErrorBody {
  error: string;
  code?: "quota_exceeded";
  /** ISO instant when the exhausted budget refills. */
  resetAt?: string;
  /** Which budget ran out: day, minute, or transcribe_day. */
  scope?: string;
}

/**
 * Maps a thrown AI error to a response, or returns null if it is not one
 * this helper handles — the caller keeps its own fallback for genuine
 * failures, which must stay a 500 rather than being flattened into a 429.
 */
export function aiQuotaResponse(err: unknown): NextResponse<AiErrorBody> | null {
  if (!(err instanceof AiQuotaExceededError)) return null;

  return NextResponse.json(
    {
      error: err.message,
      code: "quota_exceeded" as const,
      resetAt: err.resetAt.toISOString(),
      scope: err.scope,
    },
    {
      status: 429,
      headers: {
        // Same header the burst limiter already sets, so any generic client
        // backoff keeps working without knowing about quotas at all.
        "Retry-After": String(Math.max(1, Math.ceil((err.resetAt.getTime() - Date.now()) / 1000))),
      },
    }
  );
}
