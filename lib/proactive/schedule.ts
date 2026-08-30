import type { NotificationChannel, NotificationKind, NotificationPreferences } from "@/lib/proactive/types";
import { isWithinQuietHours } from "@/lib/proactive/quietHours";

/**
 * Which channels a notification of `kind` should actually go out on, given the
 * user's prefs. `in_app` is unconditional (it just queues in the centre).
 * A muted kind gets no channels at all — not even in_app.
 */
export function resolveChannels(
  kind: NotificationKind,
  prefs: NotificationPreferences
): NotificationChannel[] {
  if (prefs.mutedKinds.includes(kind)) return [];
  const channels: NotificationChannel[] = ["in_app"];
  if (prefs.channelEmail) channels.push("email");
  if (prefs.channelPush) channels.push("push");
  if (prefs.channelWhatsapp && prefs.whatsappNumber) channels.push("whatsapp");
  return channels;
}

/**
 * Whether an outbound (email/push/whatsapp) send is allowed right now. In-app
 * always queues regardless — quiet hours only defer the *push* to the user.
 */
export function canSendNow(localHour: number, prefs: NotificationPreferences): boolean {
  return !isWithinQuietHours(localHour, prefs.quietHoursStart, prefs.quietHoursEnd);
}

/**
 * Enforce the hard daily cap. `sentToday` is how many proactive notifications
 * already went out (any channel) in the user's current local day.
 */
export function isUnderDailyCap(sentToday: number, prefs: NotificationPreferences): boolean {
  return sentToday < prefs.maxPerDay;
}
