import "server-only";
import { getWebPush } from "@/lib/webpush/config";
import { pushSubscriptionsRepo } from "@/lib/db/pushSubscriptions";
import type { NotificationAction } from "@/lib/proactive/types";

// Web Push delivery — turns a queued notification into a native OS
// notification on every browser/phone the user has subscribed. Mirrors the
// email channel's contract: never throws, and reports a skip when push isn't
// configured so a deployment without VAPID keys still runs jobs cleanly.

export interface PushSendInput {
  userId: string;
  title: string;
  body: string;
  kind: string;
  action?: NotificationAction | null;
}

export type PushSendResult =
  | { ok: true; skipped?: boolean; delivered: number }
  | { ok: false; error: string };

function routeFor(action: NotificationAction | null | undefined): string {
  if (!action) return "/";
  switch (action.type) {
    case "open_route": {
      const route = typeof action.payload?.route === "string" ? action.payload.route : "/";
      return route.startsWith("/") ? route : "/";
    }
    case "create_calendar_event":
    case "reschedule_tasks":
      return "/calendar";
    case "mark_contacted":
      return "/areas/family";
    case "review_material":
      return "/areas/torah";
    default:
      return "/";
  }
}

export async function sendPush(input: PushSendInput): Promise<PushSendResult> {
  const webpush = getWebPush();
  if (!webpush) return { ok: true, skipped: true, delivered: 0 };

  let subs;
  try {
    subs = await pushSubscriptionsRepo.listForUser(input.userId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "cannot read subscriptions" };
  }
  if (subs.length === 0) return { ok: true, skipped: true, delivered: 0 };

  const payload = JSON.stringify({
    title: input.title,
    body: input.body,
    kind: input.kind,
    url: routeFor(input.action),
  });

  let delivered = 0;
  const errors: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 15 * 60, urgency: "high" }
        );
        delivered++;
        void pushSubscriptionsRepo.touch(sub.endpoint).catch(() => {});
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode;
        // The push service says this endpoint is gone — the user cleared site
        // data or uninstalled the PWA. Drop it so it is never retried.
        if (status === 404 || status === 410) {
          void pushSubscriptionsRepo.pruneDeadEndpoint(sub.endpoint).catch(() => {});
        } else {
          errors.push(`${status ?? "?"}: ${err instanceof Error ? err.message : "push failed"}`);
        }
      }
    })
  );

  if (delivered === 0 && errors.length > 0) {
    return { ok: false, error: errors.join("; ") };
  }
  return { ok: true, delivered };
}
