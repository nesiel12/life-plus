import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getUserByEmail } from "@/lib/db/users";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import {
  recoveryChallengesRepo,
  recoveryCredentialsRepo,
} from "@/lib/db/recovery";
import {
  clearUnlockCookie,
  isUnlocked,
  relyingParty,
  setUnlockCookie,
} from "@/lib/recovery/lock";

export const runtime = "nodejs";

// Unlocking the recovery space with the device's own biometric.
//
// One route with an `action` rather than five sibling routes: every step
// shares the same session lookup, rate limit and relying-party derivation,
// and splitting them would be five copies of that preamble.
//
// The private key never leaves the device's secure enclave. What is stored
// here is a public key, which is useless to anyone who reads the table — that
// is the whole reason to use WebAuthn rather than a PIN hash.

// Deliberately tight. Unlock attempts are a human tapping a fingerprint
// reader, and a loose limit here is what turns a stolen unlocked phone into
// an unlimited retry budget.
const RATE_LIMIT = { limit: 20, windowMs: 5 * 60 * 1000 };

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getUserByEmail(session.user.email);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const credentials = await recoveryCredentialsRepo.listForUser(user.id);
  return NextResponse.json({
    // Whether the space has ever been set up, and whether it is open now.
    enrolled: credentials.length > 0,
    unlocked: await isUnlocked(user.id),
    devices: credentials.map((c) => ({
      credentialId: c.credential_id,
      label: c.device_label,
      createdAt: c.created_at,
      lastUsedAt: c.last_used_at,
    })),
  });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(
    `recovery-lock:${session.user.email}`,
    RATE_LIMIT.limit,
    RATE_LIMIT.windowMs
  );
  if (limited) return limited;

  const user = await getUserByEmail(session.user.email);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { action?: string; response?: unknown; label?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { rpID, origin } = relyingParty(request);

  try {
    switch (body.action) {
      case "register-options": {
        const existing = await recoveryCredentialsRepo.listForUser(user.id);
        const options = await generateRegistrationOptions({
          rpName: "Life Plus",
          rpID,
          userName: user.email,
          userDisplayName: user.name,
          attestationType: "none",
          // Exclude what is already enrolled, so tapping "add a device" on a
          // phone already set up says so instead of silently re-registering.
          excludeCredentials: existing.map((c) => ({
            id: c.credential_id,
            transports: c.transports as never,
          })),
          authenticatorSelection: {
            // The point is Face ID / Touch ID / Windows Hello, not a roaming
            // security key: this guards a screen on the device in your hand.
            authenticatorAttachment: "platform",
            residentKey: "preferred",
            userVerification: "required",
          },
        });

        await recoveryChallengesRepo.put(user.id, options.challenge, "register");
        return NextResponse.json({ options });
      }

      case "register-verify": {
        const challenge = await recoveryChallengesRepo.take(user.id, "register");
        if (!challenge) {
          return NextResponse.json(
            { error: "פג תוקף הבקשה. נסה שוב." },
            { status: 400 }
          );
        }

        const verification = await verifyRegistrationResponse({
          response: body.response as RegistrationResponseJSON,
          expectedChallenge: challenge,
          expectedOrigin: origin,
          expectedRPID: rpID,
          requireUserVerification: true,
        });

        if (!verification.verified || !verification.registrationInfo) {
          return NextResponse.json({ error: "האימות נכשל." }, { status: 400 });
        }

        const { credential } = verification.registrationInfo;
        await recoveryCredentialsRepo.create({
          user_id: user.id,
          credential_id: credential.id,
          // bytea over PostgREST takes a hex string; Buffer gives us that
          // directly and the driver decodes it back to bytes on read.
          public_key: `\\x${Buffer.from(credential.publicKey).toString("hex")}`,
          counter: credential.counter,
          transports: credential.transports ?? [],
          device_label: typeof body.label === "string" ? body.label.slice(0, 60) : null,
        });

        // Enrolling proves presence on this device, so it also unlocks —
        // making the user authenticate again immediately would be asking them
        // to prove the same thing twice in a row.
        await setUnlockCookie(user.id);
        return NextResponse.json({ verified: true });
      }

      case "auth-options": {
        const credentials = await recoveryCredentialsRepo.listForUser(user.id);
        if (credentials.length === 0) {
          return NextResponse.json({ error: "לא הוגדרה נעילה." }, { status: 409 });
        }

        const options = await generateAuthenticationOptions({
          rpID,
          allowCredentials: credentials.map((c) => ({
            id: c.credential_id,
            transports: c.transports as never,
          })),
          userVerification: "required",
        });

        await recoveryChallengesRepo.put(user.id, options.challenge, "authenticate");
        return NextResponse.json({ options });
      }

      case "auth-verify": {
        const challenge = await recoveryChallengesRepo.take(user.id, "authenticate");
        if (!challenge) {
          return NextResponse.json({ error: "פג תוקף הבקשה. נסה שוב." }, { status: 400 });
        }

        const response = body.response as AuthenticationResponseJSON;
        const stored = await recoveryCredentialsRepo.findByCredentialId(response.id);
        // Ownership check, not just existence: a credential belonging to
        // another account must never unlock this one's recovery space.
        if (!stored || stored.user_id !== user.id) {
          return NextResponse.json({ error: "האימות נכשל." }, { status: 400 });
        }

        const verification = await verifyAuthenticationResponse({
          response,
          expectedChallenge: challenge,
          expectedOrigin: origin,
          expectedRPID: rpID,
          requireUserVerification: true,
          credential: {
            id: stored.credential_id,
            publicKey: hexToBytes(stored.public_key),
            counter: Number(stored.counter),
            transports: stored.transports as never,
          },
        });

        if (!verification.verified) {
          return NextResponse.json({ error: "האימות נכשל." }, { status: 400 });
        }

        await recoveryCredentialsRepo.updateCounter(
          stored.credential_id,
          verification.authenticationInfo.newCounter
        );
        await setUnlockCookie(user.id);
        return NextResponse.json({ verified: true });
      }

      case "lock": {
        await clearUnlockCookie();
        return NextResponse.json({ locked: true });
      }

      case "remove-device": {
        const credentialId = typeof body.response === "string" ? body.response : null;
        if (!credentialId) {
          return NextResponse.json({ error: "Invalid request." }, { status: 400 });
        }
        await recoveryCredentialsRepo.remove(user.id, credentialId);
        // Removing the last device leaves the space permanently unreachable
        // otherwise, so the lock is released along with it.
        const remaining = await recoveryCredentialsRepo.listForUser(user.id);
        if (remaining.length === 0) await clearUnlockCookie();
        return NextResponse.json({ removed: true, enrolled: remaining.length > 0 });
      }

      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (err) {
    console.error("[recovery/lock] failed:", err);
    return NextResponse.json({ error: "משהו השתבש באימות." }, { status: 500 });
  }
}

/**
 * PostgREST returns bytea as a "\\x…" hex string.
 *
 * Copied into a fresh ArrayBuffer rather than wrapping Buffer's own: Node
 * pools small Buffers into a shared backing store, and the WebAuthn types
 * require a plain (non-shared) ArrayBuffer.
 */
function hexToBytes(value: string): Uint8Array<ArrayBuffer> {
  const hex = value.startsWith("\\x") ? value.slice(2) : value;
  const buffer = Buffer.from(hex, "hex");
  const bytes = new Uint8Array(new ArrayBuffer(buffer.byteLength));
  bytes.set(buffer);
  return bytes;
}
