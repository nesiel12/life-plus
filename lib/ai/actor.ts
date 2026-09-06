import "server-only";
import { getCurrentUserId } from "@/lib/currentUser";
import type { AiActor } from "@/lib/ai/quota";

// Resolving who is spending the AI quota.
//
// Always from the session, never from anything the caller supplied. A route
// that accepted a userId in its body would let any authenticated user spend
// someone else's allowance — or, worse, name a victim and exhaust theirs.
// getCurrentUserId reads the session server-side and looks the row up fresh,
// which is the same guarantee every other user-scoped operation here relies
// on.
export async function currentUserActor(): Promise<AiActor> {
  return { kind: "user", userId: await getCurrentUserId() };
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
