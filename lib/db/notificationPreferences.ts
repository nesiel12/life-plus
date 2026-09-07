import "server-only";
import { getSupabaseClient } from "@/lib/supabase";
import type { Database } from "@/types/database";
import type { NotificationPreferences, NotificationKind } from "@/lib/proactive/types";

type Row = Database["public"]["Tables"]["notification_preferences"]["Row"];
type Update = Database["public"]["Tables"]["notification_preferences"]["Update"];

const DEFAULTS: NotificationPreferences = {
  quietHoursStart: 22,
  quietHoursEnd: 7,
  channelEmail: true,
  channelPush: false,
  channelWhatsapp: false,
  mutedKinds: [],
  whatsappNumber: null,
  maxPerDay: 6,
  scheduleAlertMinutes: 15,
};

function toPreferences(row: Row | null): NotificationPreferences {
  if (!row) return DEFAULTS;
  return {
    quietHoursStart: row.quiet_hours_start,
    quietHoursEnd: row.quiet_hours_end,
    channelEmail: row.channel_email,
    channelPush: row.channel_push,
    channelWhatsapp: row.channel_whatsapp,
    mutedKinds: (row.muted_kinds ?? []) as NotificationKind[],
    whatsappNumber: row.whatsapp_number,
    maxPerDay: row.max_per_day,
    scheduleAlertMinutes: row.schedule_alert_minutes,
  };
}

export const notificationPreferencesRepo = {
  /** Never throws on missing — a user with no row gets sensible defaults. */
  async get(userId: string): Promise<NotificationPreferences> {
    const { data, error } = await getSupabaseClient()
      .from("notification_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return toPreferences(data);
  },

  async upsert(userId: string, patch: Update): Promise<NotificationPreferences> {
    const { data, error } = await getSupabaseClient()
      .from("notification_preferences")
      .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" })
      .select()
      .single();
    if (error) throw error;
    return toPreferences(data);
  },
};
