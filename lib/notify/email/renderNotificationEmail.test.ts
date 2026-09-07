import { describe, expect, it } from "vitest";
import { renderNotificationEmail } from "@/lib/notify/email/renderNotificationEmail";

const BASE = {
  title: "הבוקר שלך",
  body: "בוקר טוב. היום יש לך פגישה ב-09:00.",
  kind: "briefing_ready",
  unsubscribeUrl: "https://app.example.com/api/notifications/unsubscribe?token=abc.def",
  preferencesUrl: "https://app.example.com/settings",
};

describe("renderNotificationEmail", () => {
  it("renders as a right-to-left Hebrew document", () => {
    const { html } = renderNotificationEmail(BASE);
    expect(html).toContain('<html lang="he" dir="rtl">');
  });

  it("prefixes the subject by kind so the inbox says what it is", () => {
    expect(renderNotificationEmail(BASE).subject).toBe("הבוקר שלך · הבוקר שלך");
    expect(renderNotificationEmail({ ...BASE, kind: "reminder_event", title: "אימון" }).subject).toBe(
      "תזכורת · אימון"
    );
  });

  it("falls back to the bare title for an unrecognised kind", () => {
    expect(renderNotificationEmail({ ...BASE, kind: "brand_new_kind" }).subject).toBe("הבוקר שלך");
  });

  it("always includes the unsubscribe and preferences links", () => {
    const { html, text } = renderNotificationEmail(BASE);
    expect(html).toContain(BASE.unsubscribeUrl);
    expect(html).toContain(BASE.preferencesUrl);
    expect(text).toContain(BASE.unsubscribeUrl);
  });

  it("escapes user-derived content instead of interpolating it as markup", () => {
    const { html } = renderNotificationEmail({
      ...BASE,
      // An event title comes from the user's Google Calendar — it is data,
      // and must never become markup in an email.
      title: '<script>alert("x")</script>',
      body: "a < b & c",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("a &lt; b &amp; c");
  });

  it("renders the action button only when both a URL and a label are given", () => {
    const without = renderNotificationEmail(BASE);
    expect(without.html).not.toContain("<a href=\"https://app.example.com/calendar\"");

    const withAction = renderNotificationEmail({
      ...BASE,
      actionUrl: "https://app.example.com/calendar",
      actionLabel: "פתח את היומן",
    });
    expect(withAction.html).toContain("https://app.example.com/calendar");
    expect(withAction.html).toContain("פתח את היומן");
  });

  it("preserves paragraph breaks the job wrote", () => {
    const { html } = renderNotificationEmail({ ...BASE, body: "פסקה ראשונה\n\nפסקה שנייה" });
    expect(html).toContain("פסקה ראשונה");
    expect(html).toContain("פסקה שנייה");
    // Two blocks, not one run-on paragraph.
    expect(html.match(/<p style="margin:0 0 14px/g)?.length).toBe(2);
  });

  it("includes the reason line when present and omits it otherwise", () => {
    expect(renderNotificationEmail(BASE).html).not.toContain("font-style:italic");
    const withReason = renderNotificationEmail({ ...BASE, reason: "על סמך היומן שלך" });
    expect(withReason.html).toContain("על סמך היומן שלך");
  });

  it("produces a plain-text alternative carrying the same substance", () => {
    const { text } = renderNotificationEmail({ ...BASE, reason: "על סמך היומן שלך" });
    expect(text).toContain(BASE.title);
    expect(text).toContain(BASE.body);
    expect(text).toContain("על סמך היומן שלך");
  });

  it("leaves no unresolved template expressions", () => {
    const { html } = renderNotificationEmail({
      ...BASE,
      reason: "על סמך היומן",
      actionUrl: "https://app.example.com/",
      actionLabel: "פתח",
    });
    expect(html).not.toContain("${");
    expect(html).not.toContain("undefined");
  });
});
