-- Phase 1: Notification & Delivery Infrastructure.
--
-- The Proactive Engine could already decide what to tell the user; it could
-- not actually reach them. Everything here is about closing that gap:
--   * a per-user timezone, so "morning" means their morning
--   * per-channel delivery state, so a bounced email is observable
--   * reminder idempotency on manual_events, whose reminder_minutes column
--     has existed since 20260726000005 with nothing ever consuming it
--   * a stored Google Calendar grant, so a job running at 07:00 while nobody
--     is signed in can still see what is actually on the user's calendar
--
-- See docs/PROACTIVE_ENGINE.md.

-- ── 1. Per-user IANA timezone ────────────────────────────────────────────
-- personal_dna is the established home for single-row-per-user traits
-- collected at onboarding (chronotype_settings, core_priorities live here).
-- NULL until inferred from the browser; readers fall back to the existing
-- Asia/Jerusalem default in lib/proactive/timezone.ts.
--
-- The check is a shape guard, not a validity guard — Postgres has no list of
-- IANA zones. Real validation happens at the write site against
-- Intl.supportedValuesOf('timeZone'); this only stops obvious junk.
alter table personal_dna
  add column timezone text
    check (timezone is null or timezone ~ '^[A-Za-z]+/[A-Za-z0-9_+-]+$');

-- ── 2. manual_events reminder idempotency ────────────────────────────────
-- reminder_sweep runs repeatedly through the day. A conditional
-- "UPDATE ... WHERE reminded_at IS NULL" is what claims an event exactly
-- once, so two overlapping sweeps cannot both notify for the same event.
alter table manual_events
  add column reminded_at timestamptz;

-- Partial index: the sweep's hot query is "events with a reminder set that
-- have not fired yet", which is a small slice of the table and stays small.
create index manual_events_pending_reminder_idx
  on manual_events (user_id, start_time)
  where reminder_minutes is not null and reminded_at is null;

-- ── 3. Per-channel delivery outcome ──────────────────────────────────────
-- notifications.channels[] records which channels a notification was *meant*
-- for. This records what actually happened on each, so a failed send can be
-- retried without re-sending a delivered one, and a persistent failure is
-- visible rather than silent.
--
-- Shape: { "email": { "status": "sent"|"pending"|"failed",
--                     "at": "<iso>", "error": "…", "attempts": 2 } }
alter table notifications
  add column delivery jsonb not null default '{}'::jsonb;

-- The dispatcher's hot query: this user's un-sent, due notifications.
create index notifications_pending_dispatch_idx
  on notifications (user_id, scheduled_for)
  where status = 'pending' and sent_at is null;

-- ── 4. Stored Google Calendar grant ──────────────────────────────────────
-- Until now the Google access/refresh tokens lived only on the NextAuth JWT
-- cookie (lib/auth.ts), which means they exist only inside a request made by
-- a signed-in browser. Every scheduled job runs with no browser and no
-- cookie, so morning_briefing could not see the user's real calendar — the
-- single most important thing a morning briefing is about.
--
-- Same shape and same reasoning as google_photos_credentials
-- (20260903000000): the token is written on sign-in and refreshed
-- server-side. Rows are deleted with the user.
--
-- Security note: these are bearer credentials for a third-party account.
-- They are reachable only through the service-role key, which is server-only
-- (lib/supabase.ts) — the same trust boundary the photos credentials already
-- sit behind. RLS is enabled with no policies, so an anon/authenticated key
-- can never read this table even if one were ever introduced.
create table google_calendar_credentials (
  user_id uuid primary key references users(id) on delete cascade,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz not null,
  scope text not null,
  -- Set when a refresh fails permanently (revoked grant, changed password).
  -- Jobs skip a user whose grant is broken instead of retrying every run.
  invalid_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table google_calendar_credentials enable row level security;
