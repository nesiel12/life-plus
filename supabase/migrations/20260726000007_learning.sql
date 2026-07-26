-- Learning & Knowledge Space (Phase 7): personal learning topics
-- (programming, lore analysis, any self-directed subject) with an AI Track
-- Builder that populates each topic's resources (YouTube/podcast/article/
-- equipment/summary) in one shot. Same shape as tasks/books: user-scoped,
-- RLS enabled with no policies defined (see 20260720000000_init.sql's header
-- for the access-model rationale — the service-role key + explicit user_id
-- filtering in lib/db/*.ts is the real tenant boundary today, not RLS).
--
-- learning_resources denormalizes user_id onto the child row (the same
-- choice habit_logs already made) rather than only scoping through
-- topic_id — lets the resources table go through createUserScopedRepo
-- directly instead of a bespoke ownership-checking module for every CRUD
-- op, and the store holds a flat learningResources array the same way it
-- holds a flat habitLogs array.

create table learning_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  category text,
  status text not null default 'planning' check (status in ('planning', 'active', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index learning_topics_user_id_idx on learning_topics(user_id);

alter table learning_topics enable row level security;

create trigger learning_topics_set_updated_at
  before update on learning_topics
  for each row execute function set_updated_at();

create table learning_resources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  topic_id uuid not null references learning_topics(id) on delete cascade,
  type text not null check (type in ('youtube', 'podcast', 'article', 'equipment', 'summary')),
  title text not null,
  url text,
  notes text,
  is_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index learning_resources_user_id_idx on learning_resources(user_id);
create index learning_resources_topic_id_idx on learning_resources(topic_id);

alter table learning_resources enable row level security;

create trigger learning_resources_set_updated_at
  before update on learning_resources
  for each row execute function set_updated_at();
