import "server-only";
import { renderNotificationEmail } from "@/lib/notify/email/renderNotificationEmail";
import { signUnsubscribeToken } from "@/lib/notify/email/unsubscribeToken";
import type { NotificationAction } from "@/lib/proactive/types";

// Transactional email via Resend, called over its REST API with plain fetch
// rather than the SDK — the same choice every Google Calendar call in this
// codebase makes, and one fewer dependency for one endpoint.

export interface EmailSendInput {
  userId: string;
  toEmail: string;
  kind: string;
  title: string;
  body: string;
  reason?: string;
  action?: NotificationAction | null;
  /** The notification row id, when this send has one. Used as an idempotency
   *  key so a retry after a network wobble can't deliver the same email
   *  twice. */
  notificationId?: string;
}

export type EmailSendResult = { ok: true; skipped?: boolean } | { ok: false; error: string };

/** Where links in the email point. Falls back to the auth URL in dev. */
function appUrl(): string {
  const base = process.env.EMAIL_APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return base.replace(/\/+$/, "");
}

/**
 * The in-app destination for a notification's Approve/Modify affordance.
 *
 * Always a *page*, never an endpoint that performs the action. An emailed
 * link is a URL anyone who sees the message can follow, and mail clients
 * prefetch links — so a one-click "approve" URL would be executed by a
 * scanner, not a person. The user lands on the surface and confirms there,
 * which is the app's standing Approve/Modify rule (docs/ATLAS_BIBLE.md #4).
 */
function actionLink(action: NotificationAction | null | undefined): { url: string; label: string } | null {
  if (!action) return null;
  const base = appUrl();
  switch (action.type) {
    case "open_route": {
      const route = typeof action.payload?.route === "string" ? action.payload.route : "/";
      // Only same-origin app paths — never an arbitrary URL from a payload.
      const safe = route.startsWith("/") ? route : "/";
      return { url: `${base}${safe}`, label: "פתח באפליקציה" };
    }
    case "create_calendar_event":
      return { url: `${base}/calendar`, label: "פתח את היומן" };
    case "reschedule_tasks":
      return { url: `${base}/calendar`, label: "פתח את היומן" };
    case "mark_contacted":
      return { url: `${base}/areas/family`, label: "פתח את אנשי הקשר" };
    case "review_material":
      return { url: `${base}/areas/torah`, label: "פתח את החומר" };
    default:
      return null;
  }
}

interface ResendErrorBody {
  message?: string;
  name?: string;
}

/**
 * Sends one notification as email.
 *
 * Never throws. A per-user sweep must treat one undeliverable address as a
 * skip, and the caller records the outcome on the notification row so a
 * transient failure is retried and a permanent one becomes visible.
 */
export async function sendEmail(input: EmailSendInput): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  // Links that resolve to localhost are a strong spam signal and are useless
  // to the recipient. If mail is configured but the app URL isn't, say so
  // loudly once per send rather than letting every briefing land in spam.
  if (apiKey && from && appUrl().includes("localhost")) {
    console.warn(
      "[notify:email] RESEND_API_KEY is set but the app URL is localhost — " +
        "set EMAIL_APP_URL to the public URL or emails will look like spam."
    );
  }

  if (!apiKey || !from) {
    // Unconfigured is not an error: local development and any deploy without
    // mail set up should still run jobs, produce in-app notifications, and
    // report success. Reporting failure here would mark every notification
    // as undeliverable and retry it forever.
    if (process.env.NODE_ENV !== "production") {
      console.info(`[notify:email] (not configured) would send "${input.title}" to ${input.toEmail}`);
    }
    return { ok: true, skipped: true };
  }

  const base = appUrl();
  let unsubscribeUrl: string;
  try {
    unsubscribeUrl = `${base}/api/notifications/unsubscribe?token=${encodeURIComponent(
      signUnsubscribeToken(input.userId)
    )}`;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "cannot sign unsubscribe link" };
  }

  const link = actionLink(input.action);
  const { subject, html, text } = renderNotificationEmail({
    title: input.title,
    body: input.body,
    reason: input.reason,
    kind: input.kind,
    actionUrl: link?.url,
    actionLabel: link?.label,
    unsubscribeUrl,
    preferencesUrl: `${base}/settings`,
  });

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.toEmail],
        subject,
        html,
        text,
        // A monitored reply-to beats a bare no-reply@ for both deliverability
        // and trust: a domain whose mail is never replied to looks more like
        // a spam source. Falls back to the From address.
        reply_to: process.env.EMAIL_REPLY_TO || from,
        // Resend groups bounces, complaints and opens by tag — the signal
        // that tells you a specific notification kind is landing in spam.
        tags: [{ name: "kind", value: input.kind.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64) }],
        headers: {
          // RFC 8058: lets Gmail and friends render a native Unsubscribe
          // control. Without it a recurring email is far likelier to be
          // reported as spam than unsubscribed from, which costs the sending
          // domain its reputation.
          "List-Unsubscribe": `<${unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          // Idempotency: a retry of the same notification is de-duplicated by
          // Resend instead of double-delivered.
          ...(input.notificationId ? { "X-Entity-Ref-ID": input.notificationId } : {}),
        },
      }),
      // A hung provider must not hold a cron invocation open to its limit.
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as ResendErrorBody | null;
      return {
        ok: false,
        error: `resend ${res.status}: ${payload?.message ?? payload?.name ?? res.statusText}`,
      };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "email send failed" };
  }
}
