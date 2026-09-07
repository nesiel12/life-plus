import type { NextRequest } from "next/server";
import { notificationPreferencesRepo } from "@/lib/db/notificationPreferences";
import { verifyUnsubscribeToken } from "@/lib/notify/email/unsubscribeToken";
import { NOTIFICATION_KIND_LABELS, type NotificationKind } from "@/lib/proactive/types";

export const runtime = "nodejs";

// One-click unsubscribe, reached from an email with no session.
//
// Deliberately outside middleware.ts's PROTECTED list: requiring a sign-in to
// stop receiving email is precisely the friction RFC 8058 exists to remove,
// and it is what turns "unsubscribe" into "report as spam". The signed token
// is the authorisation.

function page(title: string, message: string, status = 200): Response {
  const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title}</title>
</head>
<body style="margin:0;background:#f6f5f2;font-family:'Heebo','Assistant',Arial,sans-serif;
             display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;">
  <main style="max-width:440px;background:#fff;border:1px solid #e6e3dc;border-radius:16px;padding:28px;text-align:center;">
    <p style="margin:0 0 14px;font-size:12px;letter-spacing:3px;font-weight:700;color:#b89355;" dir="ltr">LIFE PLUS</p>
    <h1 style="margin:0 0 10px;font-size:19px;color:#16161a;">${title}</h1>
    <p style="margin:0;font-size:15px;line-height:1.7;color:#6b6b73;">${message}</p>
  </main>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function unsubscribe(token: string | null): Promise<Response> {
  if (!token) {
    return page("הקישור לא תקין", "חסר מזהה בקישור. אפשר לנהל התראות מתוך האפליקציה.", 400);
  }

  const payload = verifyUnsubscribeToken(token);
  if (!payload) {
    // Never distinguishes "bad signature" from "unknown user" — that
    // difference would make this endpoint an oracle for whether an address
    // has an account.
    return page("הקישור לא תקין", "הקישור פג או שאינו תקין. אפשר לנהל התראות מתוך האפליקציה.", 400);
  }

  try {
    if (payload.kind) {
      const prefs = await notificationPreferencesRepo.get(payload.uid);
      const kind = payload.kind as NotificationKind;
      const muted = prefs.mutedKinds.includes(kind)
        ? prefs.mutedKinds
        : [...prefs.mutedKinds, kind];
      await notificationPreferencesRepo.upsert(payload.uid, { muted_kinds: muted });
      const label = NOTIFICATION_KIND_LABELS[kind] ?? payload.kind;
      return page(
        "בוטלה ההרשמה",
        `לא תקבל/י יותר התראות מסוג “${label}”. אפשר להפעיל שוב בכל עת בהגדרות באפליקציה.`
      );
    }

    await notificationPreferencesRepo.upsert(payload.uid, { channel_email: false });
    return page(
      "הוסרת מרשימת התפוצה",
      "לא יישלחו אליך יותר מיילים מ-Life Plus. ההתראות ימשיכו להופיע בתוך האפליקציה, ואפשר להפעיל מיילים מחדש בכל עת בהגדרות."
    );
  } catch (err) {
    console.error("[notifications] unsubscribe failed:", err);
    return page("משהו השתבש", "לא הצלחנו לעדכן את ההעדפות. נסה שוב, או שנה את ההגדרה באפליקציה.", 500);
  }
}

export async function GET(request: NextRequest) {
  return unsubscribe(request.nextUrl.searchParams.get("token"));
}

/** RFC 8058 one-click: mail clients POST to the same URL. */
export async function POST(request: NextRequest) {
  return unsubscribe(request.nextUrl.searchParams.get("token"));
}
