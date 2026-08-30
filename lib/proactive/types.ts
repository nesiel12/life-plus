// Proactive Engine shared types. See docs/PROACTIVE_ENGINE.md.

export type JobName =
  | "daily_insight"
  | "morning_briefing"
  | "reminder_sweep"
  | "recommendation_expiry"
  | "busy_week_scan";

export type NotificationKind =
  | "daily_insight"
  | "briefing_ready"
  | "reminder_family"
  | "reminder_review"
  | "reminder_medical"
  | "milestone_slipping"
  | "busy_week"
  | "suggestion";

export type NotificationChannel = "in_app" | "email" | "push" | "whatsapp";

export type NotificationStatus =
  | "pending"
  | "sent"
  | "read"
  | "acted"
  | "dismissed"
  | "expired";

/** An Approve/Modify affordance attached to a notification. Never auto-executed. */
export interface NotificationAction {
  type:
    | "create_calendar_event"
    | "reschedule_tasks"
    | "open_route"
    | "mark_contacted"
    | "review_material";
  payload: Record<string, unknown>;
}

/** What a job hands to the notifier — pre-phrased, Hebrew, ready to persist/send. */
export interface DraftNotification {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  reason?: string;
  action?: NotificationAction;
  /** stable per (kind + salient entity + logical day) — see buildDedupeKey */
  dedupeKey: string;
  scheduledFor?: Date;
  expiresAt?: Date;
}

export interface NotificationPreferences {
  quietHoursStart: number;
  quietHoursEnd: number;
  channelEmail: boolean;
  channelPush: boolean;
  channelWhatsapp: boolean;
  mutedKinds: NotificationKind[];
  whatsappNumber: string | null;
  maxPerDay: number;
}

export interface JobResult {
  itemsProduced: number;
  detail?: Record<string, unknown>;
}

export type JobScope = "per_user" | "global";
