-- ----------------------------------------------------------------------------
-- learning_checkpoint_answers — the Masterclass & Gaming OS's persisted
-- inline-checkpoint answers.
--
-- Phase 1's InlineCheckpoint UI (components/features/learning/LessonViewport.tsx)
-- was answered client-side only — nothing here to persist meant reopening a
-- lesson reset every checkpoint, and a correct answer had nowhere to record
-- itself for XP. This table is that record: one row per checkpoint a person
-- has ever answered, keyed by the exact generated variant it belongs to.
--
-- Keyed by (step_id, user_age_group, teaching_mode, checkpoint_id) — the same
-- three axes learning_lesson_contents uses for its own cache key — rather
-- than checkpoint_id alone: checkpoint_id is chosen freely by the model
-- (lib/validations/learning.ts only requires it non-empty) and is only
-- guaranteed unique *within* one generated lesson. Regenerating the same step
-- under a different age group or teaching mode produces a different set of
-- checkpoints; without the full key, a "cp1" from one variant could silently
-- read back as an answer to an unrelated "cp1" from another.
--
-- attempts increments on every re-answer (see
-- app/actions/masterclassProgress.ts's upsert) so a repeat visit can show
-- "you got this on your Nth try" — but XP is only ever awarded on the
-- wrong-to-correct transition (lib/learning/masterclassXp.ts), computed from
-- is_correct as it stands, never from attempts itself: repeatedly retrying an
-- already-correct answer earns nothing further.
-- ----------------------------------------------------------------------------

create table if not exists learning_checkpoint_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  topic_id uuid not null references learning_topics(id) on delete cascade,
  step_id uuid not null references learning_resources(id) on delete cascade,

  user_age_group text not null check (user_age_group in ('KIDS_8_12', 'TEENS_13_18', 'ADULTS_19_PLUS')),
  teaching_mode text not null check (teaching_mode in ('STORYTELLING', 'PRACTICAL', 'ANALOGIES', 'SOCRATIC')),
  checkpoint_id text not null,

  selected_index integer not null check (selected_index between 0 and 3),
  is_correct boolean not null,
  attempts integer not null default 1 check (attempts > 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One answer row per checkpoint, per generated variant.
create unique index if not exists learning_checkpoint_answers_key
  on learning_checkpoint_answers(step_id, user_age_group, teaching_mode, checkpoint_id);

alter table learning_checkpoint_answers enable row level security;

create trigger learning_checkpoint_answers_set_updated_at
  before update on learning_checkpoint_answers
  for each row execute function set_updated_at();
