import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// One-click unsubscribe has to work from an email client, with no session and
// no cookie — the reader is not signed in, and demanding a sign-in to stop
// receiving email is the pattern RFC 8058 exists to eliminate.
//
// So the link carries a signed, self-describing token: who, optionally which
// kind, and when it was issued. Signed with NEXTAUTH_SECRET (already required
// for the app to boot) so a token cannot be forged to unsubscribe someone
// else. Deliberately not encrypted — a user id in a link the user already
// received is not a secret worth hiding, and HMAC is what stops tampering.

export interface UnsubscribePayload {
  /** The user this token acts for. */
  uid: string;
  /** Mute one kind rather than the whole channel, when present. */
  kind?: string;
  /** Issued-at, seconds. Present so a token can be aged out if ever needed. */
  iat: number;
}

function secret(): string {
  const value = process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error("NEXTAUTH_SECRET is required to sign unsubscribe links");
  return value;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64url(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function sign(payload: string): string {
  return base64url(createHmac("sha256", secret()).update(payload).digest());
}

export function signUnsubscribeToken(uid: string, kind?: string): string {
  const payload = base64url(
    JSON.stringify({ uid, ...(kind ? { kind } : {}), iat: Math.floor(Date.now() / 1000) })
  );
  return `${payload}.${sign(payload)}`;
}

/** Returns the payload, or null for anything malformed or badly signed. */
export function verifyUnsubscribeToken(token: string): UnsubscribePayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !signature) return null;

  let expected: string;
  try {
    expected = sign(payload);
  } catch {
    return null;
  }

  // Constant-time compare, so the endpoint cannot be used as an oracle to
  // brute-force a valid signature byte by byte.
  const given = fromBase64url(signature);
  const want = fromBase64url(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

  try {
    const decoded = JSON.parse(fromBase64url(payload).toString("utf8")) as UnsubscribePayload;
    if (typeof decoded.uid !== "string" || !decoded.uid) return null;
    if (decoded.kind !== undefined && typeof decoded.kind !== "string") return null;
    return decoded;
  } catch {
    return null;
  }
}
