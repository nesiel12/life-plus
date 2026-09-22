-- The Learning OS upgrade: a reading shelf, a quotes vault, and quiz history.
--
-- Flashcards deliberately get no new table: srs_cards + lib/torah/srs.ts is
-- already a real, working SM-2 engine (front/back, ease factor, due date,
-- lapses, a polymorphic source_type/source_id pair). The one thing stopping
-- the Learning lab from using it as-is is the source_type check constraint,
-- so this only widens that — everything else (scheduling, grading, mastery
-- tiers, review history) is reused verbatim, keyed on
-- source_type = 'learning_topic', source_id = the topic's id.

alter table srs_cards drop constraint if exists srs_cards_source_type_check;
alter table srs_cards add constraint srs_cards_source_type_check
  check (source_type in ('lesson', 'summary', 'book', 'knowledge_entry', 'concept', 'manual', 'learning_topic'));

-- A book or long-form article someone is reading, optionally hung off a
-- learning topic. `on delete set null` on topic_id, not cascade: a book is
-- its own thing (its quotes, its progress) and outlives the topic that
-- happened to introduce it — deleting a topic should not silently delete
-- someone's reading history.
create table if not exists learning_books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  topic_id uuid references learning_topics(id) on delete set null,

  kind text not null default 'book' check (kind in ('book', 'article')),
  title text not null,
  author text,
  category text,
  cover_image_url text,

  -- Progress is in whichever unit the person tracks by. A total of 0 means
  -- "not entered yet" (progress is then shown as a count, not a bar) rather
  -- than a division by zero.
  unit_label text not null default 'page' check (unit_label in ('page', 'chapter')),
  total_units integer not null default 0 check (total_units >= 0),
  progress_units integer not null default 0 check (progress_units >= 0),

  status text not null default 'to_read' check (status in ('to_read', 'reading', 'finished')),
  notes text,

  started_at timestamptz,
  finished_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists learning_books_user_id_idx on learning_books(user_id);
create index if not exists learning_books_topic_id_idx on learning_books(topic_id);

alter table learning_books enable row level security;

create trigger learning_books_set_updated_at
  before update on learning_books
  for each row execute function set_updated_at();

-- A saved passage from a book, for the quotes vault. Cascades with the book —
-- a quote with nothing to cite is not a quote.
create table if not exists learning_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  book_id uuid not null references learning_books(id) on delete cascade,

  quote_text text not null,
  note text,
  chapter_label text,

  created_at timestamptz not null default now()
);

create index if not exists learning_quotes_user_id_idx on learning_quotes(user_id);
create index if not exists learning_quotes_book_id_idx on learning_quotes(book_id);

alter table learning_quotes enable row level security;

-- One row per finished quiz, for the mastery index's history and for
-- reviewing what was actually asked. `questions` carries the full attempt
-- (prompt, the options offered, what was answered, whether it was right) so
-- a past quiz can be shown back, not just its score.
create table if not exists learning_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  topic_id uuid not null references learning_topics(id) on delete cascade,

  score integer not null check (score >= 0),
  total integer not null check (total > 0),
  questions jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists learning_quiz_attempts_user_id_idx on learning_quiz_attempts(user_id);
create index if not exists learning_quiz_attempts_topic_id_idx on learning_quiz_attempts(topic_id);

alter table learning_quiz_attempts enable row level security;

-- No RLS policies, matching every other table in this schema: the app talks
-- to Postgres exclusively with the service-role key (lib/supabase.ts), so
-- "RLS enabled, zero policies" is defence in depth against a leaked
-- anon/public key, not the access-control mechanism in normal operation.
