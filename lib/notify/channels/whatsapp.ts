import "server-only";
import type { DraftNotification, NotificationPreferences } from "@/lib/proactive/types";

// WhatsApp channel. STUB — needs Meta WhatsApp Business API or Twilio
// credentials (a founder decision + external signup, see docs/PROACTIVE_ENGINE.md
// §7). No-op until WHATSAPP_* env is present so job runs still succeed.
export async function sendWhatsApp(
  draft: DraftNotification,
  prefs: NotificationPreferences
): Promise<void> {
  if (!process.env.WHATSAPP_ACCESS_TOKEN || !prefs.whatsappNumber) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[notify:whatsapp] (stub) would send "${draft.title}" to ${prefs.whatsappNumber ?? "no number"}`);
    }
    return;
  }
  // TODO(M2): implement the WhatsApp Business send + inbound webhook handler.
  throw new Error("whatsapp channel: credentials set but sender not implemented yet");
}
