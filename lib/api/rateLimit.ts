import { NextResponse } from "next/server";

interface Bucket {
  count: number;
  resetAt: number;
}

// In-memory, per-process fixed-window limiter. Correct and sufficient for a
// single instance; once Atlas runs on more than one, this needs to move to a
// shared store (e.g. Upstash/Redis) or each instance enforces its own
// separate limit — tracked in docs/BACKLOG.md.
const buckets = new Map<string, Bucket>();

function checkRateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; resetAt: number } {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, resetAt: now + windowMs };
  }

  if (existing.count >= limit) {
    return { allowed: false, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return { allowed: true, resetAt: existing.resetAt };
}

// Returns a 429 response if the caller is over their limit, or null to let
// the route continue. Callers key this on authenticated identity (email),
// never on IP alone, since every route this guards already requires a
// session.
export function rateLimitResponse(key: string, limit: number, windowMs: number): NextResponse | null {
  const result = checkRateLimit(key, limit, windowMs);
  if (result.allowed) return null;

  return NextResponse.json(
    { error: "Too many requests, please slow down." },
    {
      status: 429,
      headers: { "Retry-After": String(Math.ceil((result.resetAt - Date.now()) / 1000)) },
    }
  );
}
