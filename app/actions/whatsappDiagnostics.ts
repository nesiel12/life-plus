"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { notificationPreferencesRepo } from "@/lib/db/notificationPreferences";
import { notificationsRepo } from "@/lib/db/notifications";
import { sendWhatsApp } from "@/lib/notify/channels/whatsapp";

// WhatsApp delivery diagnostics for the settings page — the WhatsApp twin of
// emailDiagnostics.ts, same reasoning: the proactive pipeline is deliberately
// hard to observe from outside, so these two actions surface the delivery
// record and let the user force one real send to their own number.

export type TestWhatsAppResult =
  | { status: "sent"; toNumber: string }
  | { status: "not_configured"; toNumber: string }
  | { status: "no_number" }
  | { status: "failed"; toNumber: string; error: string };

export async function sendTestWhatsAppAction(): Promise<TestWhatsAppResult> {
  const userId = await getCurrentUserId();
  const prefs = await notificationPreferencesRepo.get(userId);
  if (!prefs.whatsappNumber) return { status: "no_number" };

  const result = await sendWhatsApp({
    toNumber: prefs.whatsappNumber,
    kind: "suggestion",
    title: "בדיקת WhatsApp מ-Life Plus",
    body: "אם ההודעה הזו הגיעה, שליחת ה-WhatsApp מוגדרת ועובדת.",
    reason: "שלחת בקשה לבדיקת WhatsApp מתוך ההגדרות",
  });

  if (result.ok && result.skipped) return { status: "not_configured", toNumber: prefs.whatsappNumber };
  if (result.ok) return { status: "sent", toNumber: prefs.whatsappNumber };
  return { status: "failed", toNumber: prefs.whatsappNumber, error: result.error };
}

export interface WhatsAppDeliveryEntry {
  id: string;
  kind: string;
  title: string;
  createdAt: string;
  sentAt: string | null;
  status: string;
  channels: string[];
  /** The whatsapp channel's recorded outcome, when there is one. */
  whatsapp: { status: string; at?: string; error?: string; attempts?: number } | null;
}

export async function getWhatsAppDeliveryStatusAction(): Promise<WhatsAppDeliveryEntry[]> {
  const userId = await getCurrentUserId();
  const rows = await notificationsRepo.recentForDiagnostics(userId, 8);

  return rows.map((row) => {
    const delivery = (row.delivery ?? {}) as Record<
      string,
      { status?: string; at?: string; error?: string; attempts?: number }
    >;
    const whatsapp = delivery.whatsapp
      ? {
          status: String(delivery.whatsapp.status ?? "unknown"),
          at: delivery.whatsapp.at,
          error: delivery.whatsapp.error,
          attempts: delivery.whatsapp.attempts,
        }
      : null;

    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      createdAt: row.created_at,
      sentAt: row.sent_at ?? null,
      status: row.status,
      channels: (row.channels ?? []) as string[],
      whatsapp,
    };
  });
}
