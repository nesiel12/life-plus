import "server-only";
import type { NotificationAction } from "@/lib/proactive/types";
import { routeFor } from "@/lib/notify/channels/webpush";

// WhatsApp delivery via Twilio's Messages API, called over plain fetch with
// Basic Auth rather than the Twilio SDK — the same choice email.ts makes for
// Resend ("one fewer dependency"), and it keeps every notify/channels/* file
// dependency-free beyond its own provider's REST contract.

export interface WhatsAppSendInput {
  /** E.164, e.g. "+972521234567" — no "whatsapp:" prefix, this adds it. */
  toNumber: string;
  kind: string;
  title: string;
  body: string;
  reason?: string;
  action?: NotificationAction | null;
}

export type WhatsAppSendResult =
  { ok: true; skipped?: boolean } | { ok: false; error: string };

const KIND_EMOJI: Record<string, string> = {
  daily_insight: "💡",
  briefing_ready: "☀️",
  reminder_event: "📅",
  schedule_transition: "⏰",
  recovery_support: "🤝",
  reminder_family: "❤️",
  reminder_review: "📖",
  reminder_medical: "💊",
  milestone_slipping: "🎯",
  busy_week: "📈",
  suggestion: "✨",
};

/** Where links in the message point. Falls back to the auth URL in dev. */
function appUrl(): string {
  const base =
    process.env.EMAIL_APP_URL ??
    process.env.NEXTAUTH_URL ??
    "http://localhost:3000";
  return base.replace(/\/+$/, "");
}

/**
 * Short, bulleted, emoji-led — built for a chat bubble, not an inbox.
 * `*bold*` and `_italic_` are WhatsApp's own message-formatting markup, not
 * Markdown; a plain-text client that doesn't render them still reads fine.
 */
function formatMessage(input: WhatsAppSendInput): string {
  const emoji = KIND_EMOJI[input.kind] ?? "🔔";
  const lines = [`${emoji} *${input.title}*`, "", input.body];
  if (input.reason) lines.push("", `_${input.reason}_`);
  if (input.action) lines.push("", `🔗 ${appUrl()}${routeFor(input.action)}`);
  return lines.join("\n");
}

interface TwilioErrorBody {
  message?: string;
  code?: number;
}

/**
 * Sends one notification as a WhatsApp message.
 *
 * Never throws — same contract as sendEmail/sendPush. A per-user sweep must
 * treat one undeliverable number as a skip, and the caller records the
 * outcome on the notification row so a transient failure is retried and a
 * permanent one becomes visible.
 */
export async function sendWhatsApp(
  input: WhatsAppSendInput,
): Promise<WhatsAppSendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_NUMBER;

  if (!sid || !token || !from) {
    // Unconfigured is not an error: a deploy without Twilio set up should
    // still run jobs, produce in-app notifications, and report success.
    // Reporting failure here would mark every notification as undeliverable
    // and retry it forever.
    if (process.env.NODE_ENV !== "production") {
      console.info(
        `[notify:whatsapp] (not configured) would send "${input.title}" to ${input.toNumber}`,
      );
    }
    return { ok: true, skipped: true };
  }

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          From: `whatsapp:${from}`,
          To: `whatsapp:${input.toNumber}`,
          Body: formatMessage(input),
        }),
        // A hung provider must not hold a cron invocation open to its limit.
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!res.ok) {
      const payload = (await res
        .json()
        .catch(() => null)) as TwilioErrorBody | null;
      return {
        ok: false,
        error: `twilio ${res.status}: ${payload?.message ?? res.statusText}`,
      };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "whatsapp send failed",
    };
  }
}
