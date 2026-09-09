# Email delivery — setup and troubleshooting

The Proactive Engine produces notifications (morning briefing, reminders,
insights) and delivers the ones the user opted into over email, via
**Resend**. In-app notifications work with zero configuration; email needs the
three env vars below **and** a verified sending domain.

Pipeline: a producer job writes a `notifications` row → `notification_dispatch`
reads due rows and calls `sendEmail` (`lib/notify/channels/email.ts`) → the
per-channel result is recorded back on the row's `delivery` JSON. Nothing here
throws; a failed send is retried up to 3 times, then marked `failed`.

## 1. Configure

Set in the deployment environment (Vercel → Project → Settings → Environment
Variables) and in `.env.local` for local runs:

| Var | Value |
|---|---|
| `RESEND_API_KEY` | From the Resend dashboard → API Keys. |
| `EMAIL_FROM` | A sender **on a domain you have verified in Resend**, e.g. `Life Plus <noreply@mail.yourdomain.com>`. The display name is optional but improves deliverability. |
| `EMAIL_APP_URL` | The public app URL, no trailing slash, e.g. `https://yourdomain.com`. Used for deep links and the unsubscribe link. Falls back to `NEXTAUTH_URL`; if that is `localhost`, mail is flagged as spam and `sendEmail` logs a warning. |
| `EMAIL_REPLY_TO` | *Optional.* A monitored address replies go to, e.g. `hello@yourdomain.com`. Improves deliverability and trust — a domain whose mail is never replied to looks more like a spam source. Defaults to the `EMAIL_FROM` address. |

**Headers set on every send** (`lib/notify/channels/email.ts`): RFC 8058
`List-Unsubscribe` + `List-Unsubscribe-Post: One-Click`, a `reply_to`, a
Resend `kind` tag (so bounces/complaints/opens can be traced to a specific
notification type in the Resend dashboard), and `X-Entity-Ref-ID` set to the
notification row id for idempotency — a retry after a network wobble is
de-duplicated rather than delivered twice. Both `text/plain` and `text/html`
parts are always included.

Without `RESEND_API_KEY` **or** `EMAIL_FROM`, `sendEmail` is a no-op that
reports `{ ok: true, skipped: true }` — jobs still run, in-app notifications
still appear, and nothing is marked failed. The settings page → **בדיקת מסירת
מייל** → "שלח מייל בדיקה" reports this state as *"שליחת מייל לא מוגדרת בשרת"*.

## 2. Verify the sending domain (this is what stops spam)

In Resend → Domains → Add Domain, then add the DNS records it generates at
your DNS provider. Resend gives you:

- **SPF** — a `TXT` record on the sending subdomain (`send.yourdomain.com`)
  authorising Resend's mail servers.
- **DKIM** — a `TXT`/`CNAME` record so receivers can cryptographically verify
  the message was sent by you and not altered.
- **MX** (on the sending subdomain) — for bounce and complaint handling.

Add a **DMARC** record yourself on `_dmarc.yourdomain.com` — start relaxed and
tighten once you see reports:

```
_dmarc.yourdomain.com  TXT  "v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com; fo=1"
```

Until the domain shows **Verified** in Resend, sends either fail with a 403
(recorded as `failed` with the Resend error) or Resend only delivers to the
address that owns the Resend account. Testing to your own address works
immediately with Resend's shared `onboarding@resend.dev` sender, but never use
that in production — it has no domain alignment and will land in spam.

## 3. Verify end to end

1. Deploy with the three vars set.
2. Settings → **בדיקת מסירת מייל** → **שלח מייל בדיקה**.
   - *נשלח* → check the inbox within a minute; if it is in spam, mark "not
     spam" once — that materially improves the next sends.
   - *נכשל: resend 403 …* → the domain is not verified yet (step 2).
   - *לא מוגדר* → env vars missing (step 1).
3. The list under the button shows the last 8 real notifications and whether
   each one's email was sent, is pending, or failed (with the attempt count).
   The Resend error string is on hover of a failed row.
4. Force a real proactive email: `npm run cron -- daily` locally, or hit
   `GET /api/cron/daily` with the `CRON_SECRET` bearer. Then re-check the list.

## 4. Common causes of "failing or going to spam"

| Symptom | Cause | Fix |
|---|---|---|
| Test says *לא מוגדר* | `RESEND_API_KEY` / `EMAIL_FROM` unset | Step 1 |
| Test says *נכשל: resend 403* | Domain not verified / `EMAIL_FROM` not on a verified domain | Step 2 |
| Delivered but in spam | No DKIM/SPF alignment, or links point to `localhost` | Step 2, and set `EMAIL_APP_URL` |
| Delivered but in spam, domain verified | New sending domain has no reputation | Send low volume at first; the RFC 8058 one-click unsubscribe header is already set, which protects reputation |
| Nothing sent, no failure recorded | Quiet hours, daily cap, muted kind, or `channel_email` off | Settings page; `notification_dispatch` detail shows `skipped: "quiet_hours"` etc. |
| `sent` in the list but no email | Provider accepted then bounced | Check the Resend dashboard → Logs for that message |

## 5. Where things are

- `lib/notify/channels/email.ts` — the Resend call, never throws.
- `lib/notify/email/renderNotificationEmail.ts` — the RTL HTML template.
- `lib/proactive/jobs/notificationDispatch.ts` — reads due rows, calls send, records outcome, enforces quiet hours + daily cap.
- `app/actions/emailDiagnostics.ts` — the test-send and history actions behind the settings card.
- `app/api/notifications/unsubscribe/route.ts` — one-click unsubscribe target.
