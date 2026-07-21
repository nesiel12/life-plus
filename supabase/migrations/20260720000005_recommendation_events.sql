-- Recommendation Intelligence & Feedback Loop v1
-- (docs/ATLAS_ARCHITECTURE_VISION.md §7) — the missing half of the
-- self-learning loop. Personal DNA (§3) infers patterns from what the user
-- does; this table records what Atlas *suggested* and what the user did
-- about it, so that feedback can eventually shape future confidence.
--
-- Only `pending` has any valid outgoing transition (see
-- lib/intelligence/recommendations/feedback.ts's isValidStatusTransition,
-- enforced here atomically via an `eq('status','pending')` guard on
-- update rather than a read-then-write) — once a user has responded,
-- that's final for v1; there's no "un-reject" flow.

create type recommendation_status as enum ('pending', 'accepted', 'rejected', 'modified', 'expired');

create table recommendation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null,
  source text not null,
  recommendation_payload jsonb not null default '{}',
  status recommendation_status not null default 'pending',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create index recommendation_events_user_id_created_at_idx on recommendation_events(user_id, created_at desc);
create index recommendation_events_user_id_type_idx on recommendation_events(user_id, type);

alter table recommendation_events enable row level security;
