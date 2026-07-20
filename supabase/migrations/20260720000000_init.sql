-- Atlas V2 — initial schema
--
-- Access model (see docs/ARCHITECTURE_AUDIT.md and docs/ROADMAP_V2.md Phase 1/2):
-- Identity lives in NextAuth (Google OAuth), not Supabase Auth. All application
-- code talks to Postgres through a server-only client authenticated with the
-- Supabase *service role* key (see lib/supabase.ts) — that key always bypasses
-- Row Level Security by design. Every query in the data-access layer
-- (lib/db/*.ts) is therefore required to filter by user_id explicitly; that
-- discipline, not RLS, is the primary tenant-isolation boundary today.
--
-- RLS is still enabled on every table below, with no policies defined. That is
-- deliberate, not an oversight: it means any future key that is NOT the service
-- role (e.g. the anon key, if client-side queries are ever added) gets zero
-- access by default, fail-closed, until real per-row policies are written for
-- that use case. Do not treat RLS as active protection against the server-side
-- code path until that work is done — track it in docs/ROADMAP_V2.md, not here.

create extension if not exists "pgcrypto";

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================================
-- users — one row per authenticated identity. Linked to NextAuth by email.
-- ============================================================================
create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  hebrew_name text,
  life_stage text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table users enable row level security;

create trigger users_set_updated_at
  before update on users
  for each row execute function set_updated_at();

-- ============================================================================
-- life_area_scores — the 5 life-area scores per user. Labels/colors/icons are
-- static app config (lib/lifeAreas.ts), not stored per-user data.
-- ============================================================================
create type life_area_key as enum ('faith', 'family', 'knowledge', 'health', 'career');

create table life_area_scores (
  user_id uuid not null references users(id) on delete cascade,
  area_key life_area_key not null,
  score smallint not null default 50 check (score between 0 and 100),
  last_touched date,
  updated_at timestamptz not null default now(),
  primary key (user_id, area_key)
);

alter table life_area_scores enable row level security;

create trigger life_area_scores_set_updated_at
  before update on life_area_scores
  for each row execute function set_updated_at();

-- ============================================================================
-- people — Family Care contacts.
-- ============================================================================
create table people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  hebrew_name text,
  relation text not null,
  last_meaningful_interaction timestamptz,
  birthday text check (birthday ~ '^\d{2}-\d{2}$'),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index people_user_id_idx on people(user_id);

alter table people enable row level security;

create trigger people_set_updated_at
  before update on people
  for each row execute function set_updated_at();

-- ============================================================================
-- moments — the cross-cutting Timeline feed.
-- ============================================================================
create type moment_category as enum ('faith', 'family', 'knowledge', 'health', 'career', 'general');

create table moments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  category moment_category not null,
  title text not null,
  content text not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index moments_user_id_occurred_at_idx on moments(user_id, occurred_at desc);

alter table moments enable row level security;

-- ============================================================================
-- upcoming_events — Today dashboard's "meaningful moments coming up".
-- ============================================================================
create table upcoming_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  category moment_category not null,
  event_date date not null,
  created_at timestamptz not null default now()
);

create index upcoming_events_user_id_date_idx on upcoming_events(user_id, event_date);

alter table upcoming_events enable row level security;

-- ============================================================================
-- knowledge_entries — Torah Space seder log.
-- ============================================================================
create table knowledge_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  entry_date date not null default current_date,
  topic text not null,
  source text not null,
  summary text not null,
  duration_minutes smallint,
  created_at timestamptz not null default now()
);

create index knowledge_entries_user_id_date_idx on knowledge_entries(user_id, entry_date desc);

alter table knowledge_entries enable row level security;

-- ============================================================================
-- daily_intentions — one intention per user per day (replaces the single
-- unscoped todayIntention string in the V0 store).
-- ============================================================================
create table daily_intentions (
  user_id uuid not null references users(id) on delete cascade,
  intention_date date not null default current_date,
  intention text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, intention_date)
);

alter table daily_intentions enable row level security;

create trigger daily_intentions_set_updated_at
  before update on daily_intentions
  for each row execute function set_updated_at();

-- ============================================================================
-- personal_dna — AI Memory / onboarding-collected traits, one row per user.
-- ============================================================================
create table personal_dna (
  user_id uuid primary key references users(id) on delete cascade,
  peak_focus_hours text,
  learning_style text,
  family_check_in_interval_days smallint,
  habit_notes text[] not null default '{}',
  onboarding_complete boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table personal_dna enable row level security;

create trigger personal_dna_set_updated_at
  before update on personal_dna
  for each row execute function set_updated_at();

-- ============================================================================
-- goals + milestones — the Goals Engine.
-- ============================================================================
create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  category life_area_key not null,
  target_date date,
  created_at timestamptz not null default now()
);

create index goals_user_id_idx on goals(user_id);

alter table goals enable row level security;

create table milestones (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references goals(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

create index milestones_goal_id_idx on milestones(goal_id);

alter table milestones enable row level security;

-- ============================================================================
-- chat_messages + insights — Background AI's conversation + generated insights.
-- ============================================================================
create type chat_role as enum ('user', 'assistant', 'system');

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  role chat_role not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index chat_messages_user_id_created_at_idx on chat_messages(user_id, created_at);

alter table chat_messages enable row level security;

create table insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index insights_user_id_created_at_idx on insights(user_id, created_at desc);

alter table insights enable row level security;
