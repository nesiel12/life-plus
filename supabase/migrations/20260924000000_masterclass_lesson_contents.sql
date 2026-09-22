-- ----------------------------------------------------------------------------
-- learning_lesson_contents — the Masterclass & Gaming OS's generated-lesson
-- cache.
--
-- One row per (topic, step, age group, teaching mode): the same combination
-- asked for twice returns the cached row instead of spending another AI call
-- to regenerate content that would come out nearly identical. Keyed by the
-- full combination, not just (topic, step), because the whole point of the
-- age/teaching-mode axes is that they change the actual content, not just a
-- display setting layered on top of one canonical lesson.
--
-- user_id is here for the same reason every other table in this app carries
-- it, not because the content is inherently private per person: this app has
-- no shared/global content anywhere (learning_topics themselves are each a
-- user's own), so a cache table that broke that pattern would be the one
-- inconsistent table, not a deliberate design choice.
-- ----------------------------------------------------------------------------

create table if not exists learning_lesson_contents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  topic_id uuid not null references learning_topics(id) on delete cascade,
  step_id uuid not null references learning_resources(id) on delete cascade,

  user_age_group text not null check (user_age_group in ('KIDS_8_12', 'TEENS_13_18', 'ADULTS_19_PLUS')),
  teaching_mode text not null check (teaching_mode in ('STORYTELLING', 'PRACTICAL', 'ANALOGIES', 'SOCRATIC')),

  -- The full validated LessonBlockContent (lib/validations/learning.ts).
  content jsonb not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The cache lookup key, literally: one row per combination.
create unique index if not exists learning_lesson_contents_cache_key
  on learning_lesson_contents(topic_id, step_id, user_age_group, teaching_mode);

alter table learning_lesson_contents enable row level security;

create trigger learning_lesson_contents_set_updated_at
  before update on learning_lesson_contents
  for each row execute function set_updated_at();
