-- Proactive Engine (M2) — the background layer that runs without the user
-- present, notices things, and reaches out. See docs/PROACTIVE_ENGINE.md.
--
-- Three tables:
--   job_runs                 — execution ledger; idempotency + observability
--   notifications            — everything Atlas wants to tell the user, any channel
--   notification_preferences — one row per user; quiet hours, channels, caps
--
-- RLS enabled with no policies defined, same as every prior table (see
-- 20260720000000_init.sql's header — the service-role key + explicit user_id
-- filtering in lib/db/*.ts is the tenant boundary, not RLS).

-- ============================================================================
-- job_runs — one row per (job_name, scope_key, run_date). The unique
-- constraint is the idempotency key: a second run for the same logical day is
-- a no-op unless the first one failed.
-- ============================================================================
create table job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  scope_key text not null,               -- a user_id, or 'global' for cross-user sweeps
  run_date date not null,                -- the logical day this run is FOR
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed', 'skipped')),
  items_produced integer not null default 0,
  detail jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create unique index job_runs_identity_idx on job_runs(job_name, scope_key, run_date);
create index job_runs_job_name_started_at_idx on job_runs(job_name, started_at desc);

alter table job_runs enable row level security;

-- ============================================================================
-- notifications — the queue of things to surface/send. In-app is always a
-- channel; email/push/whatsapp are gated by notification_preferences.
-- ============================================================================
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null,                    -- daily_insight | briefing_ready | reminder_family |
                                         -- reminder_review | reminder_medical | milestone_slipping |
                                         -- busy_week | suggestion
  title text not null,
  body text not null,
  reason text,                           -- the "על סמך…" attribution
  action jsonb,                          -- optional Approve/Modify affordance: { type, payload }
  channels text[] not null default array['in_app'],
  dedupe_key text not null,              -- stable per (kind + entity + logical day)
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'read', 'acted', 'dismissed', 'expired')),
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  read_at timestamptz,
  acted_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index notifications_user_dedupe_idx on notifications(user_id, dedupe_key);
create index notifications_user_status_scheduled_idx on notifications(user_id, status, scheduled_for);

alter table notifications enable row level security;

-- ============================================================================
-- notification_preferences — one row per user, PK = user_id (same single-row
-- shape as personal_dna). Auto-created by lib/auth.ts events.signIn.
-- ============================================================================
create table notification_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  quiet_hours_start smallint not null default 22 check (quiet_hours_start between 0 and 23),
  quiet_hours_end smallint not null default 7 check (quiet_hours_end between 0 and 23),
  channel_email boolean not null default true,
  channel_push boolean not null default false,
  channel_whatsapp boolean not null default false,
  muted_kinds text[] not null default array[]::text[],
  whatsapp_number text,                  -- E.164; null until connected
  max_per_day smallint not null default 6 check (max_per_day between 0 and 50),
  updated_at timestamptz not null default now()
);

alter table notification_preferences enable row level security;

create trigger notification_preferences_set_updated_at
  before update on notification_preferences
  for each row execute function set_updated_at();
