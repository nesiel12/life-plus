// Proactive Engine shared types. See docs/PROACTIVE_ENGINE.md.

export type JobName =
  | "daily_insight"
  | "morning_briefing"
  | "reminder_sweep"
  | "recommendation_expiry"
  | "busy_week_scan"
  | "notification_dispatch"
  | "schedule_transition"
  | "recovery_support"
  | "relationship_nudge";

export type NotificationKind =
  | "daily_insight"
  | "briefing_ready"
  | "reminder_event"
  | "schedule_transition"
  | "recovery_support"
  | "reminder_family"
  | "reminder_review"
  | "reminder_medical"
  | "milestone_slipping"
  | "busy_week"
  | "suggestion";

/** Hebrew labels for the kinds, for the settings mute list and the UI. */
export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, string> = {
  daily_insight: "תובנה יומית",
  briefing_ready: "תדריך בוקר",
  reminder_event: "תזכורות לאירועים",
  schedule_transition: "מעברים בלוז",
  recovery_support: "תמיכה במרחב האישי",
  reminder_family: "תזכורות משפחה",
  reminder_review: "תזכורות חזרה על חומר",
  reminder_medical: "תזכורות רפואיות",
  milestone_slipping: "יעדים שנתקעו",
  busy_week: "שבוע עמוס",
  suggestion: "הצעות",
};

export const NOTIFICATION_KINDS = Object.keys(NOTIFICATION_KIND_LABELS) as NotificationKind[];

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
  /** Lead time for schedule-transition alerts, in minutes. 0 disables them. */
  scheduleAlertMinutes: number;
}

export interface JobResult {
  itemsProduced: number;
  detail?: Record<string, unknown>;
  /**
   * "skipped" leaves the scope re-claimable later the same logical day.
   *
   * This is what lets a job self-gate on the user's local clock: morning
   * briefing is invoked from a handful of UTC-spaced cron runs, returns
   * "skipped" until it is actually 07:00 for that person, then runs once and
   * records "succeeded", which the unique index turns into a no-op for the
   * rest of the day. Without it the first invocation of the day would burn
   * the idempotency key at the wrong hour.
   */
  status?: "succeeded" | "skipped";
}

export type JobScope = "per_user" | "global";

/**
 * Where a job's idempotency lives.
 *
 * "job_runs" (the default) is once per logical day, enforced by the
 * `(job_name, scope_key, run_date)` unique index. Right for daily work.
 *
 * "self" means the job carries its own idempotency in its own data — a
 * `sent_at` stamp, a conditional `reminded_at` update — and may run many
 * times a day. Writing a job_runs row per invocation would both defeat the
 * unique index and grow the ledger without bound.
 */
export type JobLedger = "job_runs" | "self";

export interface JobContext {
  /** Present only for `per_user` jobs. */
  userId?: string;
  /** YYYY-MM-DD the run is logically for. */
  logicalDay: string;
  now: Date;
}

export interface Job {
  name: JobName;
  scope: JobScope;
  /** Defaults to "job_runs" — once per logical day. */
  ledger?: JobLedger;
  run(ctx: JobContext): Promise<JobResult>;
}
