-- ----------------------------------------------------------------------------
-- learning_step_content — the topic canvas's Live Step Content Preview cache.
--
-- One generated "step brief" (summary, core concepts, a diagram, active-recall
-- checks, a Feynman prompt, one practice task — StepBriefContentSchema in
-- lib/validations/learning.ts) per (topic, step). Selecting a step on the
-- canvas timeline reads this row first, so returning to a step is instant and
-- never spends a second AI call. Unlike learning_lesson_contents it is not
-- keyed by age group / teaching mode: the brief is a neutral study aid, not a
-- persona-styled lesson.
--
-- user_id for the same reason as every other table in this app (see the
-- learning_lesson_contents migration).
-- ----------------------------------------------------------------------------

create table if not exists learning_step_content (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  topic_id uuid not null references learning_topics(id) on delete cascade,
  step_id uuid not null references learning_resources(id) on delete cascade,

  content jsonb not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists learning_step_content_step_key
  on learning_step_content(step_id);

create index if not exists learning_step_content_user_topic
  on learning_step_content(user_id, topic_id);

alter table learning_step_content enable row level security;

create trigger learning_step_content_set_updated_at
  before update on learning_step_content
  for each row execute function set_updated_at();
