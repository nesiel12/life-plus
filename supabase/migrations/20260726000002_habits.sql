-- Time & Tasks Space (Phase 5) — Daily Habits tracker, replacing the last
-- static Timeline placeholder with a real feature. Two tables:
--
-- habits — the habit itself. Daily frequency is assumed for every habit
-- (a per-habit schedule/frequency is deliberately out of scope this pass,
-- per "keep it lean"); mutable, so it gets updated_at + trigger like
-- books/rabbis/tasks.
--
-- habit_logs — one row per day a habit was actually completed.
-- Append/delete only, no updates, so no updated_at/trigger — same
-- append-only shape moments already has. The unique (habit_id,
-- completed_date) constraint is what makes toggling idempotent: marking
-- the same habit complete twice on the same day is a no-op, not a
-- duplicate row.
--
-- Both user-scoped, RLS enabled with no policies defined (see
-- 20260720000000_init.sql's header for the access-model rationale).

create table habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index habits_user_id_idx on habits(user_id);

alter table habits enable row level security;

create trigger habits_set_updated_at
  before update on habits
  for each row execute function set_updated_at();

create table habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  habit_id uuid not null references habits(id) on delete cascade,
  completed_date date not null,
  created_at timestamptz not null default now(),
  unique (habit_id, completed_date)
);

create index habit_logs_user_id_idx on habit_logs(user_id);
create index habit_logs_user_id_date_idx on habit_logs(user_id, completed_date);

alter table habit_logs enable row level security;
