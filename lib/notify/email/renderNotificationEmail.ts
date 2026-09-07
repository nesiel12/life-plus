// The one HTML email template, rendered per notification.
//
// Pure: takes a notification and some URLs, returns strings. That is what
// makes it testable without a mail provider, and it is why nothing here
// touches the DB or reads env directly.
//
// Everything is inline-styled with hardcoded hex. Email clients strip
// <style> blocks and have no CSS-variable support, so the app's design
// tokens (app/globals.css) genuinely cannot be reused here — a token
// reference would render as an unstyled default. The palette below mirrors
// the light theme deliberately; the email does not follow the reader's dark
// mode because most clients do not report it reliably.

export interface NotificationEmailInput {
  title: string;
  body: string;
  /** The "על סמך…" attribution line. */
  reason?: string;
  kind: string;
  /** Deep link into the app for the Approve/Modify affordance. */
  actionUrl?: string;
  actionLabel?: string;
  /** One-click unsubscribe, and the settings page. */
  unsubscribeUrl: string;
  preferencesUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const GOLD = "#b89355";
const INK = "#16161a";
const MUTED = "#6b6b73";
const SURFACE = "#ffffff";
const PAGE = "#f6f5f2";
const HAIRLINE = "#e6e3dc";

/** Subject prefixes, so a glance at the inbox says what kind of nudge it is. */
const SUBJECT_PREFIX: Record<string, string> = {
  briefing_ready: "הבוקר שלך",
  daily_insight: "התובנה היומית",
  reminder_event: "תזכורת",
  reminder_family: "תזכורת",
  reminder_review: "תזכורת",
  reminder_medical: "תזכורת",
  milestone_slipping: "יעד",
  busy_week: "שבוע עמוס",
  suggestion: "הצעה",
};

/** Minimal HTML entity escape — every interpolated value goes through it. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Preserves the paragraph breaks a job wrote, which carry real structure. */
function toParagraphs(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((block) => escapeHtml(block.trim()).replace(/\n/g, "<br />"))
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 14px;font-size:16px;line-height:1.75;color:${INK};">${block}</p>`
    )
    .join("");
}

export function renderNotificationEmail(input: NotificationEmailInput): RenderedEmail {
  const prefix = SUBJECT_PREFIX[input.kind];
  const subject = prefix ? `${prefix} · ${input.title}` : input.title;

  const actionBlock =
    input.actionUrl && input.actionLabel
      ? `<tr><td style="padding:6px 0 0;">
           <a href="${escapeHtml(input.actionUrl)}"
              style="display:inline-block;background:${INK};color:${SURFACE};text-decoration:none;
                     padding:11px 22px;border-radius:10px;font-size:15px;font-weight:600;">
             ${escapeHtml(input.actionLabel)}
           </a>
         </td></tr>`
      : "";

  const reasonBlock = input.reason
    ? `<tr><td style="padding:2px 0 0;">
         <p style="margin:0;font-size:13px;line-height:1.6;color:${MUTED};font-style:italic;">
           ${escapeHtml(input.reason)}
         </p>
       </td></tr>`
    : "";

  const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE};direction:rtl;">
  <!-- Preheader: the grey line clients show next to the subject. Hidden in
       the body itself so it isn't repeated at the top of the message. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    ${escapeHtml(input.body.slice(0, 120))}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:${PAGE};padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="max-width:560px;background:${SURFACE};border:1px solid ${HAIRLINE};
                      border-radius:16px;overflow:hidden;
                      font-family:'Heebo','Assistant',Arial,sans-serif;">
          <tr>
            <td style="padding:22px 28px 0;">
              <p style="margin:0;font-size:12px;letter-spacing:3px;font-weight:700;
                        color:${GOLD};text-transform:uppercase;" dir="ltr">
                LIFE PLUS
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <h1 style="margin:0 0 12px;font-size:21px;line-height:1.4;
                               font-weight:600;color:${INK};">
                      ${escapeHtml(input.title)}
                    </h1>
                    ${toParagraphs(input.body)}
                  </td>
                </tr>
                ${reasonBlock}
                ${actionBlock}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 22px;border-top:1px solid ${HAIRLINE};">
              <p style="margin:0;font-size:12px;line-height:1.7;color:${MUTED};">
                נשלח על ידי Life Plus ·
                <a href="${escapeHtml(input.preferencesUrl)}" style="color:${MUTED};">ניהול התראות</a> ·
                <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:${MUTED};">הסרה מרשימת התפוצה</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    input.title,
    "",
    input.body,
    input.reason ? `\n${input.reason}` : "",
    input.actionUrl ? `\n${input.actionLabel ?? "פתח באפליקציה"}: ${input.actionUrl}` : "",
    "",
    "—",
    `ניהול התראות: ${input.preferencesUrl}`,
    `הסרה מרשימת התפוצה: ${input.unsubscribeUrl}`,
  ]
    .filter((line) => line !== "")
    .join("\n");

  return { subject, html, text };
}
