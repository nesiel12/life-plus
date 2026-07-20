-- Health & Wellness module: structured daily log (sleep/mood/hydration/workout).
-- Deliberately a separate table from `moments` — those are freeform reflection
-- entries; health tracking needs typed, queryable fields (for the "impact of
-- sleep on focus" correlations the product vision calls for), not prose.

create table health_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  log_date date not null default current_date,
  sleep_hours numeric(4,1),
  mood_score smallint check (mood_score between 1 and 5),
  hydration_ml integer,
  workout_minutes integer,
  workout_type text,
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, log_date)
);

create index health_logs_user_id_date_idx on health_logs(user_id, log_date desc);

alter table health_logs enable row level security;
