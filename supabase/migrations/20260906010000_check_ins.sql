-- Periodic check-ins: what the user was actually doing, and how they felt.
--
-- WHY A TABLE AND NOT A COLUMN ON personal_dna
--
-- personal_dna holds what the user *declared* once during onboarding —
-- chronotype, stated peak hours. This holds what actually happened, sampled
-- through the day. The two disagree constantly, and that disagreement is the
-- point: the whole feature is "learn the user's real routine rather than the
-- one they described". Overwriting a declared preference with an observation
-- would destroy the baseline the observation is meant to be compared against.
create table if not exists check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,

  -- The instant being reported on, which is not necessarily when it was
  -- typed. Someone answering at 18:00 about "the last few hours" is
  -- describing their afternoon, and filing that under 18:00 would teach the
  -- system that 18:00 is when they train.
  occurred_at timestamptz not null default now(),

  -- A closed list, deliberately. Free text cannot be aggregated into a
  -- routine — "gym", "workout", "training" and "ran" are one activity to a
  -- person and four to a GROUP BY, and the value of this table is entirely
  -- in the aggregate.
  activity text not null check (
    activity in ('work', 'study', 'training', 'family', 'friends', 'rest', 'errands', 'other')
  ),

  -- 1-5, as asked. Constrained in the schema rather than only in the UI:
  -- a stray 0 or 7 would skew every average silently and there is no way to
  -- tell afterwards which rows were wrong.
  energy smallint not null check (energy between 1 and 5),

  -- Optional free text. Not aggregated — it is there for the user to read
  -- back, and for a future summariser, not for the arithmetic.
  note text,

  created_at timestamptz not null default now()
);

-- The only query shape: this user's recent check-ins, newest first.
create index if not exists check_ins_user_time_idx on check_ins(user_id, occurred_at desc);

alter table check_ins enable row level security;
