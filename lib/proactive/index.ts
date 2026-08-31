// Proactive Engine — public surface. See docs/PROACTIVE_ENGINE.md.

export type {
  JobName,
  NotificationKind,
  NotificationChannel,
  NotificationStatus,
  NotificationAction,
  DraftNotification,
  NotificationPreferences,
  JobResult,
  JobScope,
} from "@/lib/proactive/types";

export { isWithinQuietHours, nextAllowedHour } from "@/lib/proactive/quietHours";
export { buildDedupeKey, logicalDayKey } from "@/lib/proactive/dedupe";
export { resolveChannels, canSendNow, isUnderDailyCap } from "@/lib/proactive/schedule";
export {
  runJob,
  JOB_LOADERS,
  IMPLEMENTED_JOBS,
  type Job,
  type JobContext,
  type RunJobSummary,
} from "@/lib/proactive/runJob";
