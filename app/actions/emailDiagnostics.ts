"use server";

import { getCurrentUser } from "@/lib/currentUser";
import { notificationsRepo } from "@/lib/db/notifications";
import { sendEmail } from "@/lib/notify/channels/email";

// Email delivery diagnostics for the settings page.
//
// The proactive pipeline is deliberately hard to observe from outside: a
// notification is produced, queued, and delivered by three separate jobs,
// and a send that fails is recorded on the row rather than thrown. These two
// actions surface that record and let the user force one real send to their
// own inbox — the fastest way to tell "not configured" from "configured but
// the domain isn't verified" from "working, check spam".

export type TestEmailResult =
  | { status: "sent"; toEmail: string }
  | { status: "not_configured"; toEmail: string }
  | { status: "failed"; toEmail: string; error: string };

export async function sendTestEmailAction(): Promise<TestEmailResult> {
  const user = await getCurrentUser();
  if (!user.email) return { status: "failed", toEmail: "", error: "אין כתובת מייל למשתמש." };

  const result = await sendEmail({
    userId: user.id,
    toEmail: user.email,
    kind: "suggestion",
    title: "בדיקת מייל מ-Life Plus",
    body:
      "אם ההודעה הזו הגיעה לתיבה שלך, שליחת המיילים מוגדרת ועובדת.\n\n" +
      "אם היא נחתה בספאם — סמן אותה כ״לא ספאם״ פעם אחת, וזה משפר את המסירה של ההודעות הבאות.",
    reason: "שלחת בקשה לבדיקת מייל מתוך ההגדרות",
  });

  if (result.ok && result.skipped) return { status: "not_configured", toEmail: user.email };
  if (result.ok) return { status: "sent", toEmail: user.email };
  return { status: "failed", toEmail: user.email, error: result.error };
}

export interface DeliveryEntry {
  id: string;
  kind: string;
  title: string;
  createdAt: string;
  scheduledFor: string | null;
  sentAt: string | null;
  status: string;
  channels: string[];
  /** The email channel's recorded outcome, when there is one. */
  email: { status: string; at?: string; error?: string; attempts?: number } | null;
}

export async function getEmailDeliveryStatusAction(): Promise<DeliveryEntry[]> {
  const user = await getCurrentUser();
  const rows = await notificationsRepo.recentForDiagnostics(user.id, 8);

  return rows.map((row) => {
    const delivery = (row.delivery ?? {}) as Record<
      string,
      { status?: string; at?: string; error?: string; attempts?: number }
    >;
    const email = delivery.email
      ? {
          status: String(delivery.email.status ?? "unknown"),
          at: delivery.email.at,
          error: delivery.email.error,
          attempts: delivery.email.attempts,
        }
      : null;

    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      createdAt: row.created_at,
      scheduledFor: row.scheduled_for ?? null,
      sentAt: row.sent_at ?? null,
      status: row.status,
      channels: (row.channels ?? []) as string[],
      email,
    };
  });
}
