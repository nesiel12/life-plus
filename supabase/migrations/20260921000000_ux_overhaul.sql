-- ============================================================================
-- UX overhaul — Health dashboard, gamified Torah practice, interactive learning.
--
-- Additive only. Every existing reader keeps working: new columns are nullable
-- or defaulted, check constraints are only widened, and new behaviour lives in
-- new tables.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Health — macros on meals, detail on workouts, water, personal targets.
-- ----------------------------------------------------------------------------

-- Nullable on purpose: a meal logged before this migration, or logged without
-- an estimate, has UNKNOWN macros — not zero. The rings sum only what is known
-- and say how many meals are unestimated, rather than under-reporting the day.
alter table meals add column if not exists calories integer check (calories is null or calories between 0 and 10000);
alter table meals add column if not exists protein_g real check (protein_g is null or protein_g between 0 and 1000);
alter table meals add column if not exists carbs_g real check (carbs_g is null or carbs_g between 0 and 2000);
alter table meals add column if not exists fat_g real check (fat_g is null or fat_g between 0 and 1000);
-- Where the numbers came from. An AI estimate and a number the user typed must
-- never look alike.
alter table meals add column if not exists macro_source text
  check (macro_source is null or macro_source in ('ai', 'preset', 'user'));

alter table workouts add column if not exists kind text
  check (kind is null or kind in ('strength', 'cardio', 'hiit', 'yoga', 'walk', 'sport', 'other'));
-- 1 (easy) … 5 (all-out) — perceived exertion, the one intensity measure every
-- user can report without a device.
alter table workouts add column if not exists intensity smallint check (intensity is null or intensity between 1 and 5);
alter table workouts add column if not exists avg_heart_rate smallint
  check (avg_heart_rate is null or avg_heart_rate between 30 and 230);
alter table workouts add column if not exists calories_burned integer
  check (calories_burned is null or calories_burned between 0 and 5000);

create table if not exists water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  amount_ml integer not null check (amount_ml between 1 and 3000),
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists water_logs_user_day_idx on water_logs(user_id, logged_at desc);
alter table water_logs enable row level security;

-- { calories, proteinG, carbsG, fatG, waterMl } — the user's own daily targets.
-- jsonb on personal_dna rather than five columns: targets are read together,
-- written together, and a sixth one must not be a migration.
alter table personal_dna add column if not exists health_targets jsonb not null default '{}'::jsonb;

-- ----------------------------------------------------------------------------
-- Torah practice — dilemmas, counter-arguments, and battle sessions.
-- ----------------------------------------------------------------------------

-- Widened, never narrowed: existing recall/compare questions stay valid.
--   dilemma — a Talmudic ספק: two sides, each with a svara; argue one.
--   counter — the learner must answer an objection to what was taught.
alter table practice_questions drop constraint if exists practice_questions_kind_check;
alter table practice_questions add constraint practice_questions_kind_check
  check (kind in ('scenario', 'application', 'recall', 'compare', 'dilemma', 'counter'));

-- One row per finished "קרב חברותא". XP stays computed from history
-- (lib/torah/practiceStats.ts): a session IS history — the combo bonus earned
-- in it cannot be re-derived from srs_reviews alone, because the order of
-- answers (which is what a combo is) is not recorded there.
create table if not exists practice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  mode text not null default 'battle' check (mode in ('battle', 'review')),
  rounds integer not null default 0 check (rounds >= 0),
  correct integer not null default 0 check (correct >= 0),
  max_combo integer not null default 0 check (max_combo >= 0),
  -- Capped server-side (see the route): a client cannot mint XP.
  bonus_xp integer not null default 0 check (bonus_xp between 0 and 500),
  started_at timestamptz not null,
  ended_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists practice_sessions_user_idx on practice_sessions(user_id, ended_at desc);
alter table practice_sessions enable row level security;

-- ----------------------------------------------------------------------------
-- Interactive learning — video checkpoints and subject roadmaps.
-- ----------------------------------------------------------------------------

-- Comprehension checks at key moments of a YouTube video. Generated once per
-- (user, video) from the captions and stored: rewatching must not re-bill the
-- model, and must show the same questions with the learner's own answers.
create table if not exists video_checkpoints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  video_id text not null,
  topic_id uuid references learning_topics(id) on delete set null,
  -- [{ id, atSeconds, question, options[], correctIndex, explanation }]
  checkpoints jsonb not null default '[]'::jsonb,
  -- { [checkpointId]: { choice, correct, answeredAt } }
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists video_checkpoints_video_idx on video_checkpoints(user_id, video_id);
alter table video_checkpoints enable row level security;

create trigger video_checkpoints_set_updated_at
  before update on video_checkpoints
  for each row execute function set_updated_at();

-- A topic's progression as a tree: [{ id, title, summary, dependsOn[] }].
create table if not exists learning_roadmaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  topic_id uuid not null references learning_topics(id) on delete cascade,
  nodes jsonb not null default '[]'::jsonb,
  -- Node ids the learner marked done.
  completed jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists learning_roadmaps_topic_idx on learning_roadmaps(user_id, topic_id);
alter table learning_roadmaps enable row level security;

create trigger learning_roadmaps_set_updated_at
  before update on learning_roadmaps
  for each row execute function set_updated_at();
