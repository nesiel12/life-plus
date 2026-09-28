-- Life Plus Momentum Dashboard — the Statistics & Analytics Center.
--
-- Every number this feature shows (the heatmap, the streak, the momentum
-- meter, the badges) is computed at read time from these tables plus the
-- existing tasks/habits/habit_logs — the same "derive, never store" rule
-- learning_purchases and learning_streak_shield_consumptions already follow
-- (see their own migration's header). Nothing here is a running counter that
-- could drift out of step with the rows that produced it.

-- ----------------------------------------------------------------------------
-- task_completions — when a task was actually finished.
--
-- tasks.status already distinguishes todo/in-progress/done, but the tasks
-- row itself has no completion date, and updated_at changes on any edit
-- (retitling, rescheduling), not just on completion — useless for "which day
-- did this land on" the heatmap needs. Rather than adding a mutable
-- completed_at column to the mutable tasks row, this mirrors habit_logs'
-- append/replace shape: one row per task, upserted on completion and deleted
-- when a task is moved back off 'done' (see app/actions/tasks.ts). A task can
-- only be "the" completed instance of itself, hence the unique(task_id)
-- rather than habit_logs' unique(habit_id, completed_date) — a task is a
-- one-time item, not a daily recurring one.
create table if not exists task_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  completed_date date not null,
  created_at timestamptz not null default now(),
  unique (task_id)
);

create index if not exists task_completions_user_id_idx on task_completions(user_id);
create index if not exists task_completions_user_date_idx on task_completions(user_id, completed_date);

alter table task_completions enable row level security;

-- ----------------------------------------------------------------------------
-- momentum_badges — which achievements have been unlocked, and when.
--
-- The catalog itself (id, title, description, the rule that unlocks it) is
-- code — lib/gamification/badges.ts — not data, same reasoning
-- learning_purchases' item_id gives for the XP Shop catalog. This table is
-- only the append-only ledger of *when a badge was actually earned*, so a
-- later change to how hard a badge is to earn can never revoke one someone
-- already has, and the UI can tell "just unlocked" from "unlocked weeks ago"
-- for the celebration moment.
create table if not exists momentum_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  badge_id text not null,
  earned_at timestamptz not null default now(),
  unique (user_id, badge_id)
);

create index if not exists momentum_badges_user_id_idx on momentum_badges(user_id);

alter table momentum_badges enable row level security;

-- ----------------------------------------------------------------------------
-- momentum_streak_freezes — which calendar days a Streak Freeze covered.
--
-- Exact same shape and reasoning as learning_streak_shield_consumptions, one
-- level up: this protects the general momentum streak (tasks + habits
-- together), not the Torah/Learning-only one. How many freezes have been
-- *earned* is itself derived (lib/gamification/streaks.ts sums floor(run /
-- 7) across every run of consecutive active days in the user's history) —
-- so "available freezes" is earned-so-far minus count(rows here), never a
-- stored balance.
create table if not exists momentum_streak_freezes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  covers_date date not null,
  consumed_at timestamptz not null default now(),
  unique (user_id, covers_date)
);

create index if not exists momentum_streak_freezes_user_date_idx on momentum_streak_freezes(user_id, covers_date);

alter table momentum_streak_freezes enable row level security;
