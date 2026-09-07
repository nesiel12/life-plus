import { createHmac, timingSafeEqual } from "node:crypto";

// The unlock token's crypto, deliberately separate from the cookie plumbing
// in lib/recovery/lock.ts.
//
// Splitting them is what makes this testable: lock.ts imports next/headers,
// which needs a request context, and the interesting properties here —
// a tampered payload is rejected, a token cannot be reused across accounts,
// expiry is enforced — are exactly the ones worth proving.

export interface UnlockPayload {
  uid: string;
  exp: number;
}

function secret(): string {
  const value = process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error("NEXTAUTH_SECRET is required to sign recovery unlock tokens");
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function issueUnlockToken(userId: string, ttlSeconds: number): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: Math.floor(Date.now() / 1000) + ttlSeconds })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/**
 * True only for a well-formed, correctly signed, unexpired token belonging to
 * `userId`.
 *
 * Never throws — a malformed cookie is "locked", not a 500.
 */
export function verifyUnlockToken(token: string, userId: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, signature] = parts;
  if (!payload || !signature) return false;

  let expected: string;
  try {
    expected = sign(payload);
  } catch {
    return false;
  }

  const given = Buffer.from(signature, "base64url");
  const want = Buffer.from(expected, "base64url");
  // Constant-time, so this cannot be used as an oracle to discover a valid
  // signature byte by byte.
  if (given.length !== want.length || !timingSafeEqual(given, want)) return false;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as UnlockPayload;
    // Bound to the user: a token minted for one account must never unlock
    // another's recovery space.
    if (typeof decoded.uid !== "string" || decoded.uid !== userId) return false;
    if (typeof decoded.exp !== "number") return false;
    return decoded.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}
