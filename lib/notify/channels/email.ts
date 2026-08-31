import "server-only";
import type { DraftNotification } from "@/lib/proactive/types";

// Transactional email channel. STUB until a provider is chosen — Resend is the
// intended one (docs/PROACTIVE_ENGINE.md §7). When RESEND_API_KEY is set this
// should send a Hebrew, RTL, single-column email; until then it's a no-op that
// logs so job runs still succeed and the in-app notification is unaffected.
export async function sendEmail(draft: DraftNotification): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[notify:email] (stub) would send "${draft.title}" to user ${draft.userId}`);
    }
    return;
  }
  // TODO(M2): implement Resend send with an RTL Hebrew template.
  throw new Error("email channel: RESEND_API_KEY set but sender not implemented yet");
}
