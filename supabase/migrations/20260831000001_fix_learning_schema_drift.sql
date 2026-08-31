-- Schema-drift repair. The live `learning_topics` / `learning_resources`
-- tables did not match 20260726000007_learning.sql: an earlier (lost, see
-- docs/recovery/) iteration had created a different shape —
--   learning_topics:    user_id text, `description`, no `category`, no `updated_at`
--   learning_resources: user_id text, `status`, no `topic_id`, no `notes`,
--                       no `is_completed`, no `updated_at`
-- so lib/db/learning.ts and the AI Track Builder failed at runtime with
-- PostgREST error PGRST204 "Could not find the 'notes' column of
-- 'learning_resources' in the schema cache". Both tables are empty (0 rows
-- on 2026-08-31), so the safe repair is to drop and recreate them exactly as
-- the canonical migration defines. `create table` (not `create table if not
-- exists`) so a fresh database that never had the drift still gets the
-- canonical shape from 20260726000007 and this migration is a harmless
-- drop+recreate of identical structure.

drop table if exists learning_resources cascade;
drop table if exists learning_topics cascade;

create table learning_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  category text,
  status text not null default 'planning' check (status in ('planning', 'active', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index learning_topics_user_id_idx on learning_topics(user_id);

alter table learning_topics enable row level security;

create trigger learning_topics_set_updated_at
  before update on learning_topics
  for each row execute function set_updated_at();

create table learning_resources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  topic_id uuid not null references learning_topics(id) on delete cascade,
  type text not null check (type in ('youtube', 'podcast', 'article', 'equipment', 'summary')),
  title text not null,
  url text,
  notes text,
  is_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index learning_resources_user_id_idx on learning_resources(user_id);
create index learning_resources_topic_id_idx on learning_resources(topic_id);

alter table learning_resources enable row level security;

create trigger learning_resources_set_updated_at
  before update on learning_resources
  for each row execute function set_updated_at();

-- Tell PostgREST (the Supabase REST layer supabase-js talks to) to refresh
-- its schema cache immediately, rather than waiting for the periodic reload —
-- otherwise the very next insert still 404s on the new columns.
notify pgrst, 'reload schema';
