-- Web Push subscriptions — one row per (user, browser). The Daily Backbone
-- alerts ("training in 20 minutes") already flow through the notification
-- pipeline; this is the transport that turns them into a native OS
-- notification on a phone with the PWA installed.
--
-- The endpoint is the push service URL the browser handed us; p256dh + auth
-- are the client keys the payload is encrypted against (RFC 8291). A stale
-- endpoint (404/410 from the push service) is deleted by the sender, so this
-- table self-prunes.

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,

  endpoint text not null,
  p256dh text not null,
  auth text not null,

  -- Best-effort label for the settings list ("Chrome · macOS").
  user_agent text,

  created_at timestamptz not null default now(),
  last_used_at timestamptz,

  unique (user_id, endpoint)
);

create index push_subscriptions_user_id_idx on push_subscriptions(user_id);

alter table push_subscriptions enable row level security;
