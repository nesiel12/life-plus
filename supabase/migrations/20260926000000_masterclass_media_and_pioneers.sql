-- ----------------------------------------------------------------------------
-- article_extracts — the Masterclass & Gaming OS's in-app article reader
-- cache (EmbeddedArticleReader.tsx / app/api/learning/article/extract).
--
-- Deliberately NOT user-scoped, unlike every other table in this app: the
-- extracted text and AI-picked key paragraphs of a public webpage are the
-- same for every person who reads it. A user_id column here would mean
-- five different people opening the same Wikipedia article each pay for
-- their own fetch + AI call and get their own identical copy — wasteful,
-- and the one case in this app where "no shared content" would be the
-- inconsistent choice rather than the deliberate one. Keyed by url_hash
-- (sha256 of the normalized URL) rather than the raw URL so the unique
-- index stays a fixed-width, indexable column regardless of URL length.
--
-- RLS is still enabled, for the same structural-consistency reason every
-- table in this app enables it even without per-row policies — the actual
-- boundary is the service-role key, same as everywhere else, not a
-- meaningful ownership check here since there is no owner.
-- ----------------------------------------------------------------------------

create table if not exists article_extracts (
  id uuid primary key default gen_random_uuid(),
  url_hash text not null,
  source_url text not null,
  title text,
  paragraphs jsonb not null,
  key_paragraph_indices jsonb not null default '[]'::jsonb,
  key_paragraph_notes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists article_extracts_url_hash_key
  on article_extracts(url_hash);

alter table article_extracts enable row level security;

create trigger article_extracts_set_updated_at
  before update on article_extracts
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- pioneer_easter_egg_claims — one row per pioneer "joke reveal" a person has
-- opened, inside PioneerProfileDrawer.tsx. A plain claim, not an upsert-
-- with-diff like learning_checkpoint_answers: there is no "wrong then
-- right" transition here, just "seen it or not" — the bonus fires once,
-- on the first insert, and a repeat visit shows the same content for free
-- without touching the row again.
--
-- Keyed by the full (step, age group, teaching mode, pioneer) combination
-- for the same reason learning_checkpoint_answers is: pioneer.id is
-- chosen freely by the model per generation and is only guaranteed unique
-- within that one generated variant.
-- ----------------------------------------------------------------------------

create table if not exists pioneer_easter_egg_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  topic_id uuid not null references learning_topics(id) on delete cascade,
  step_id uuid not null references learning_resources(id) on delete cascade,

  user_age_group text not null check (user_age_group in ('KIDS_8_12', 'TEENS_13_18', 'ADULTS_19_PLUS')),
  teaching_mode text not null check (teaching_mode in ('STORYTELLING', 'PRACTICAL', 'ANALOGIES', 'SOCRATIC')),
  pioneer_id text not null,

  created_at timestamptz not null default now()
);

create unique index if not exists pioneer_easter_egg_claims_key
  on pioneer_easter_egg_claims(step_id, user_age_group, teaching_mode, pioneer_id);

alter table pioneer_easter_egg_claims enable row level security;
