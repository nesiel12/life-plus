-- Task priority tiers (P1/P2/P3) and time tracking (Habit Matrix follow-on).
--
-- Additive, deliberately alongside is_high_priority rather than replacing it.
-- is_high_priority is read and written by 30+ places across the app — voice
-- command parsing, the AI quick-log parser, the AI auto-prioritization route,
-- scheduling/slot-suggestion heuristics, the morning briefing formatter — most
-- of them driven by an AI prompt that names the field explicitly (see
-- lib/commands/buildCommandPrompt.ts: "isHighPriority רק אם נאמר במפורש").
-- Renaming or dropping it would mean rewriting that prompt and every one of
-- those call sites with no way to live-test the AI behavior in this
-- environment. Instead: priority is the new, richer field (used by the
-- Momentum Score and any future UI), is_high_priority stays exactly as it
-- is everywhere it already works, and lib/mappers.ts keeps the two in sync
-- on every write — see toTaskPatch's resolveTaskPriorityFields.
--
-- habits/habit_logs are untouched by this migration: they already exist
-- (20260726000002_habits.sql) with the shape the shipped Streak Engine
-- (lib/gamification/streaks.ts) derives current/longest streak and Streak
-- Freezes from. Storing current_streak/freeze_credits as columns would
-- reintroduce exactly the "a counter that can drift from the events that
-- produced it" problem that engine was built to avoid.

alter table tasks
  add column if not exists priority text not null default 'P3' check (priority in ('P1', 'P2', 'P3')),
  add column if not exists estimated_duration integer not null default 0, -- minutes
  add column if not exists actual_duration integer not null default 0; -- minutes

-- Backfill: every task already marked high-priority becomes P1, so existing
-- data reads correctly under the new tier immediately rather than starting
-- everyone at the P3 default.
update tasks set priority = 'P1' where is_high_priority = true and priority = 'P3';
