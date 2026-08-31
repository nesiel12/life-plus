import "server-only";
import { notificationsRepo } from "@/lib/db/notifications";
import { recommendationEventsRepo } from "@/lib/db/recommendationEvents";
import type { Job } from "@/lib/proactive/types";

const STALE_AFTER_DAYS = 7;

/**
 * Nightly per-user sweep. No AI, no notifications produced — pure hygiene:
 *   - pending recommendation_events older than 7 days → expired
 *     (they become a weak negative signal, per the feedback model)
 *   - pending notifications past their expires_at → expired
 */
export const recommendationExpiryJob: Job = {
  name: "recommendation_expiry",
  scope: "per_user",
  async run({ userId, now }) {
    if (!userId) return { itemsProduced: 0 };
    const cutoff = new Date(now.getTime() - STALE_AFTER_DAYS * 86_400_000).toISOString();

    const [recsExpired, notifsExpired] = await Promise.all([
      recommendationEventsRepo.expireStale(userId, cutoff),
      notificationsRepo.expireOverdue(userId),
    ]);

    return {
      itemsProduced: recsExpired + notifsExpired,
      detail: { recommendationEventsExpired: recsExpired, notificationsExpired: notifsExpired },
    };
  },
};
