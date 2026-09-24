import "server-only";
import { getCurrentUser } from "@/lib/currentUser";
import { isQuotaExemptEmail, type AiActor } from "@/lib/ai/quota";

// Resolving who is spending the AI quota.
//
// Always from the session, never from anything the caller supplied. A route
// that accepted a userId in its body would let any authenticated user spend
// someone else's allowance — or, worse, name a victim and exhaust theirs.
// getCurrentUser reads the session server-side and looks the row up fresh,
// which is the same guarantee every other user-scoped operation here relies
// on.
//
// The email is checked against AI_QUOTA_UNLIMITED_EMAILS (isQuotaExemptEmail)
// — unset by default, so this is a no-op change of behavior for everyone
// unless that env var is explicitly configured with the owner's own
// address(es). See its own doc comment for why this is a narrow, opt-in
// list rather than any broader "is this person special" check.
export async function currentUserActor(): Promise<AiActor> {
  const user = await getCurrentUser();
  if (isQuotaExemptEmail(user.email)) {
    return { kind: "exempt", userId: user.id, email: user.email };
  }
  return { kind: "user", userId: user.id };
}

/**
 * For scheduled work the owner runs on their own behalf.
 *
 * Exempt from user quotas by design: the Proactive Engine fans a nightly job
 * out per user, and charging each person for it would let cron silently eat
 * the allowance they were about to use themselves.
 */
export function systemActor(job: string): AiActor {
  return { kind: "system", job };
}
