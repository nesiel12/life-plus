"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { notificationPreferencesRepo } from "@/lib/db/notificationPreferences";
import { personalDnaRepo } from "@/lib/db/personalDna";
import { isValidTimezone, resolveUserTimezone } from "@/lib/proactive/timezone";
import { NOTIFICATION_KINDS, type NotificationKind, type NotificationPreferences } from "@/lib/proactive/types";

export interface NotificationSettings extends NotificationPreferences {
  timezone: string;
}

export async function getNotificationSettingsAction(): Promise<NotificationSettings> {
  const userId = await getCurrentUserId();
  const [prefs, dna] = await Promise.all([
    notificationPreferencesRepo.get(userId),
    personalDnaRepo.get(userId).catch(() => null),
  ]);
  return { ...prefs, timezone: resolveUserTimezone(dna?.timezone) };
}

export interface NotificationSettingsPatch {
  channelEmail?: boolean;
  quietHoursStart?: number;
  quietHoursEnd?: number;
  maxPerDay?: number;
  mutedKinds?: string[];
  timezone?: string;
  scheduleAlertMinutes?: number;
}

function clampHour(value: number): number {
  return Math.min(23, Math.max(0, Math.round(value)));
}

/**
 * Updates notification settings.
 *
 * Every field is re-validated here rather than trusted from the client: these
 * govern whether and when the app emails a real person, so an out-of-range
 * quiet-hours value or an unknown kind must be rejected at the boundary, not
 * discovered later by a cron job at 03:00.
 */
export async function updateNotificationSettingsAction(
  patch: NotificationSettingsPatch
): Promise<NotificationSettings> {
  const userId = await getCurrentUserId();

  const prefsPatch: Record<string, unknown> = {};
  if (patch.channelEmail !== undefined) prefsPatch.channel_email = patch.channelEmail;
  if (patch.quietHoursStart !== undefined) prefsPatch.quiet_hours_start = clampHour(patch.quietHoursStart);
  if (patch.quietHoursEnd !== undefined) prefsPatch.quiet_hours_end = clampHour(patch.quietHoursEnd);
  if (patch.maxPerDay !== undefined) {
    // A cap of 0 would silently disable every notification while the toggles
    // still read "on"; 20 a day is already far past useful.
    prefsPatch.max_per_day = Math.min(20, Math.max(1, Math.round(patch.maxPerDay)));
  }
  if (patch.scheduleAlertMinutes !== undefined) {
    // 0 is meaningful — it turns transition alerts off — so this clamps
    // rather than treating 0 as "unset". 120 is the column's own ceiling.
    prefsPatch.schedule_alert_minutes = Math.min(120, Math.max(0, Math.round(patch.scheduleAlertMinutes)));
  }
  if (patch.mutedKinds !== undefined) {
    // Drop anything that isn't a kind the app actually produces, so a stale
    // or crafted value can't accumulate in the column forever.
    prefsPatch.muted_kinds = patch.mutedKinds.filter((kind): kind is NotificationKind =>
      NOTIFICATION_KINDS.includes(kind as NotificationKind)
    );
  }

  const [prefs, dna] = await Promise.all([
    Object.keys(prefsPatch).length > 0
      ? notificationPreferencesRepo.upsert(userId, prefsPatch)
      : notificationPreferencesRepo.get(userId),
    patch.timezone !== undefined && isValidTimezone(patch.timezone)
      ? personalDnaRepo.upsert(userId, { timezone: patch.timezone })
      : personalDnaRepo.get(userId).catch(() => null),
  ]);

  return { ...prefs, timezone: resolveUserTimezone(dna?.timezone) };
}
