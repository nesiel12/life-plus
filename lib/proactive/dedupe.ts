import type { NotificationKind } from "@/lib/proactive/types";

/**
 * A stable key so the same nudge never lands twice. Same (kind, entity,
 * logicalDay) → same key → the `notifications(user_id, dedupe_key)` unique
 * index rejects the duplicate insert.
 *
 * `entityId` is whatever makes this notification unique within the kind:
 * a person_id for reminder_family, a milestone_id for milestone_slipping,
 * or "" for once-a-day kinds like daily_insight.
 */
export function buildDedupeKey(
  kind: NotificationKind,
  entityId: string,
  logicalDay: string // YYYY-MM-DD
): string {
  return [kind, entityId || "_", logicalDay].join(":");
}

/** YYYY-MM-DD for a Date in a given IANA timezone (defaults to the host TZ). */
export function logicalDayKey(date: Date, timeZone?: string): string {
  // en-CA gives ISO-ish YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
