import "server-only";
import { cookies } from "next/headers";
import { issueUnlockToken, verifyUnlockToken } from "@/lib/recovery/unlockToken";

// The unlock session for the recovery space.
//
// The threat model is specific and mundane: someone else picks up the
// unlocked phone. It is NOT a remote attacker — they already have to get past
// Google sign-in. So the goal is to make the recovery space unreadable to
// whoever is holding the device right now, without a second password to
// remember.
//
// A blur over data the page already holds would be theatre: the content is in
// the DOM, one devtools panel away. So unlocking is a real server-side gate —
// no recovery data is sent at all until this cookie is present and valid, and
// it expires quickly on its own.
//
// The token's crypto lives in lib/recovery/unlockToken.ts; this module is
// only the cookie handling around it.

const COOKIE_NAME = "lp_recovery_unlock";

/**
 * How long an unlock lasts.
 *
 * Short enough that a phone left on a table re-locks on its own; long enough
 * to log a craving, read your reasons, and breathe.
 */
export const UNLOCK_TTL_SECONDS = 10 * 60;

export async function setUnlockCookie(userId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, issueUnlockToken(userId, UNLOCK_TTL_SECONDS), {
    httpOnly: true, // never readable from page JS
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: UNLOCK_TTL_SECONDS,
  });
}

export async function clearUnlockCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** Whether this request carries a currently valid unlock for `userId`. */
export async function isUnlocked(userId: string): Promise<boolean> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return false;
  return verifyUnlockToken(token, userId);
}

/**
 * The relying-party identity WebAuthn credentials are bound to.
 *
 * Derived from the request rather than configured, because a credential
 * registered against one rpID simply will not verify against another — and
 * this app is reachable on localhost in development and a Vercel domain in
 * production. Reading the actual host is what keeps both working without a
 * second env var to get wrong.
 */
export function relyingParty(request: Request): { rpID: string; origin: string } {
  const url = new URL(request.url);
  // Behind Vercel's proxy the request URL's host is the internal one; the
  // forwarded header is the host the browser actually used, which is what the
  // credential is bound to.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const hostname = host.split(":")[0];
  return { rpID: hostname, origin: `${proto}://${host}` };
}
