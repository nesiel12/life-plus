import "server-only";
import { notificationsRepo } from "@/lib/db/notifications";
import { notificationPreferencesRepo } from "@/lib/db/notificationPreferences";
import { resolveChannels } from "@/lib/proactive/schedule";
import { sendEmail } from "@/lib/notify/channels/email";
import { sendWhatsApp } from "@/lib/notify/channels/whatsapp";
import type { DraftNotification } from "@/lib/proactive/types";

export interface NotifyOutcome {
  created: boolean; // false when deduped (already queued today) or the kind is muted
  channels: string[];
}

/**
 * The one entry point for the Proactive Engine to reach a user. Resolves the
 * user's channel preferences, persists the notification (dedupe-safe), and
 * fans out to the enabled outbound channels. In-app is implicit — persisting
 * the row *is* the in-app delivery; the notification centre reads the queue.
 */
export async function notify(draft: DraftNotification): Promise<NotifyOutcome> {
  const prefs = await notificationPreferencesRepo.get(draft.userId);
  const channels = resolveChannels(draft.kind, prefs);

  if (channels.length === 0) {
    return { created: false, channels: [] }; // kind is muted — not even in-app
  }

  const row = await notificationsRepo.create(draft, channels);
  if (!row) {
    return { created: false, channels }; // deduped — this nudge already exists today
  }

  // Outbound channels are best-effort: a failed email must never fail the job
  // or lose the in-app notification, which is already safely persisted.
  await Promise.allSettled([
    channels.includes("email") ? sendEmail(draft) : Promise.resolve(),
    channels.includes("whatsapp") ? sendWhatsApp(draft, prefs) : Promise.resolve(),
  ]);

  return { created: true, channels };
}
