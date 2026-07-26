-- Health & Fitness Space (Phase 8): meals and workouts as first-class
-- entities, same shape as every other CRUD feature (tasks/books/learning_
-- topics): user-scoped, RLS enabled with no policies defined (see
-- 20260720000000_init.sql's header for the access-model rationale). This
-- is deliberately separate from the pre-existing `health_logs` table
-- (20260720000001) — that table is a coarse daily summary (sleep/mood/
-- hydration/one workout-minutes total) for correlation analysis; meals and
-- workouts here are individual, timestamped, timeline-renderable events
-- (what was eaten/trained, and when), a different grain entirely.

create table meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  description text not null,
  eaten_at timestamptz not null default now(),
  type text not null check (type in ('breakfast', 'lunch', 'dinner', 'snack', 'post-workout')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index meals_user_id_idx on meals(user_id);
create index meals_user_id_eaten_at_idx on meals(user_id, eaten_at desc);

alter table meals enable row level security;

create trigger meals_set_updated_at
  before update on meals
  for each row execute function set_updated_at();

-- end_time is nullable — a workout can be logged as already complete (both
-- times known) or just started (end_time filled in later), the same
-- "quick log now, refine later" allowance transactions.shift_end already
-- has for work shifts.
create table workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  start_time timestamptz not null default now(),
  end_time timestamptz,
  routine_details text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time is null or end_time > start_time)
);

create index workouts_user_id_idx on workouts(user_id);
create index workouts_user_id_start_time_idx on workouts(user_id, start_time desc);

alter table workouts enable row level security;

create trigger workouts_set_updated_at
  before update on workouts
  for each row execute function set_updated_at();
