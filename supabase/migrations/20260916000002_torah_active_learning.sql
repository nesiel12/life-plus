-- ============================================================================
-- מרחב תורה — active learning, study tracks, and the AI חברותא.
--
-- Covers "לתרגל" (learning chunks → scenario questions → graded attempts),
-- spaced-repetition flashcards, long-range study goals, the Havruta debate
-- threads, and contradiction alerts.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- learning_chunks — a lesson split into 3–4 digestible segments to practise
-- against, one at a time.
--
-- Distinct from lesson_segments, which are *navigational* ("jump to 15:30").
-- A chunk is a unit of study with its own practice gate; the two do not
-- necessarily align, and collapsing them would mean either practising after
-- every topic change (too often) or navigating by chunk (too coarse).
-- ----------------------------------------------------------------------------
create table if not exists learning_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  lesson_id uuid not null references lessons(id) on delete cascade,

  ordinal integer not null,
  title text not null,

  -- The chunk's own text, extracted from the transcript. Duplicated from
  -- the transcript rather than stored as offsets, because a re-transcription
  -- would silently shift every offset and re-point every chunk at the wrong
  -- words — a corruption with no error to notice.
  body text not null,

  start_seconds integer,
  end_seconds integer,

  -- Null until the user finishes the chunk's practice.
  completed_at timestamptz,

  created_at timestamptz not null default now()
);

create unique index if not exists learning_chunks_order_idx
  on learning_chunks(user_id, lesson_id, ordinal);

alter table learning_chunks enable row level security;

-- ----------------------------------------------------------------------------
-- practice_questions — scenario-based questions, not recall prompts.
-- ----------------------------------------------------------------------------
create table if not exists practice_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,

  -- Questions can hang off a lesson as a whole or one chunk of it.
  lesson_id uuid references lessons(id) on delete cascade,
  chunk_id uuid references learning_chunks(id) on delete cascade,

  kind text not null default 'scenario' check (kind in (
    'scenario',     -- "חבר טוען ש… איך היית עונה לו?"
    'application',  -- apply the principle to a new case
    'recall',       -- the plain one, kept for cases that genuinely need it
    'compare'       -- against another source the user has learned
  )),

  prompt text not null,

  -- What a strong answer contains — shown after the attempt, never before.
  model_answer text,

  -- The graded dimensions the model marks against:
  -- [{ criterion, weight, note }]. Stored per question, because "did they
  -- cite the machloket" only applies to questions that have one.
  rubric jsonb not null default '[]'::jsonb,

  difficulty smallint not null default 2 check (difficulty between 1 and 5),

  created_at timestamptz not null default now()
);

create index if not exists practice_questions_lesson_idx on practice_questions(user_id, lesson_id);
create index if not exists practice_questions_chunk_idx on practice_questions(user_id, chunk_id);

alter table practice_questions enable row level security;

-- ----------------------------------------------------------------------------
-- practice_attempts — the user's answer and the AI's grading of it.
--
-- Append-only: a second attempt at the same question is a new row, never an
-- update. The whole point of the module is progress over time, and progress
-- is invisible if each attempt overwrites the last.
-- ----------------------------------------------------------------------------
create table if not exists practice_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  question_id uuid not null references practice_questions(id) on delete cascade,

  answer text not null,

  -- 0..100. Null while grading is in flight or if grading failed — the
  -- answer is still saved, because losing the user's writing to a model
  -- outage is not acceptable.
  score smallint check (score is null or (score between 0 and 100)),

  ai_feedback text,

  created_at timestamptz not null default now()
);

create index if not exists practice_attempts_question_idx
  on practice_attempts(user_id, question_id, created_at desc);

alter table practice_attempts enable row level security;

-- ----------------------------------------------------------------------------
-- srs_cards — flashcards with real spaced-repetition state (SM-2).
--
-- knowledge_entries.flashcards (jsonb, 20260720000006) stays exactly as it
-- is and keeps working: it is a generated {front, back} pair list with no
-- scheduling. It cannot become this, because SM-2 needs per-card mutable
-- state (ease, interval, due date, lapses) and a jsonb array gives every
-- card the same row lock and no index on "what is due today" — the one
-- query this feature runs constantly.
--
-- Migration path for existing cards is a backfill, not a schema change:
-- see docs/TORAH_KG_PLAN.md §Phase 5.
-- ----------------------------------------------------------------------------
create table if not exists srs_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,

  front text not null,
  back text not null,

  -- Where this card came from, same polymorphic convention as elsewhere.
  source_type text check (source_type in ('lesson', 'summary', 'book', 'knowledge_entry', 'concept', 'manual')),
  source_id text,

  concept_id uuid references concepts(id) on delete set null,

  -- ---- SM-2 state ----
  -- Named for the algorithm they implement so the fields are not mistaken
  -- for arbitrary counters. lib/torah/srs.ts is the only writer.
  ease_factor real not null default 2.5 check (ease_factor >= 1.3),
  interval_days integer not null default 0 check (interval_days >= 0),
  repetitions integer not null default 0 check (repetitions >= 0),

  -- How many times a mature card was forgotten. Surfaced as "this one keeps
  -- slipping" rather than silently re-queued forever.
  lapses integer not null default 0,

  -- The scheduler's whole index. A new card is due immediately.
  due_at timestamptz not null default now(),

  last_reviewed_at timestamptz,
  last_grade smallint check (last_grade is null or (last_grade between 0 and 5)),

  -- Soft archive, so retiring a card keeps its history for the stats.
  suspended_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- "What is due right now" — the query every session opens with. Partial, so
-- suspended cards cost nothing in the index.
create index if not exists srs_cards_due_idx
  on srs_cards(user_id, due_at)
  where suspended_at is null;

create index if not exists srs_cards_source_idx on srs_cards(user_id, source_type, source_id);

alter table srs_cards enable row level security;

create trigger srs_cards_set_updated_at
  before update on srs_cards
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- srs_reviews — the review log behind the card state.
--
-- srs_cards holds *current* state; this holds how it got there. Kept
-- separate because the mastery/streak visualisations need history, and
-- because an SM-2 bug is undebuggable without the sequence of grades that
-- produced a schedule.
-- ----------------------------------------------------------------------------
create table if not exists srs_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  card_id uuid not null references srs_cards(id) on delete cascade,

  grade smallint not null check (grade between 0 and 5),

  -- State snapshot *after* applying this grade, so a row is self-contained.
  interval_days integer not null,
  ease_factor real not null,

  -- How long the user looked at the card. Feeds "you are hesitating on
  -- these" without needing a second telemetry path.
  duration_ms integer,

  reviewed_at timestamptz not null default now()
);

create index if not exists srs_reviews_card_idx on srs_reviews(user_id, card_id, reviewed_at desc);
create index if not exists srs_reviews_user_day_idx on srs_reviews(user_id, reviewed_at desc);

alter table srs_reviews enable row level security;

-- ----------------------------------------------------------------------------
-- study_tracks — "לסיים משנה ברורה בחצי שנה".
-- ----------------------------------------------------------------------------
create table if not exists study_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,

  title text not null,
  book_id uuid references books(id) on delete set null,

  start_date date not null default current_date,
  target_date date,

  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'abandoned')),

  -- Cadence the AI planned to, e.g. { daysPerWeek: 5, unitsPerSession: 2 }.
  -- Stored so a re-plan after a slip can keep the user's actual rhythm
  -- rather than re-asking.
  cadence jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists study_tracks_user_status_idx on study_tracks(user_id, status);

alter table study_tracks enable row level security;

create trigger study_tracks_set_updated_at
  before update on study_tracks
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- study_track_items — the broken-down daily/weekly units.
-- ----------------------------------------------------------------------------
create table if not exists study_track_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  track_id uuid not null references study_tracks(id) on delete cascade,

  ordinal integer not null,
  label text not null,

  -- What this unit actually covers — "סימן ר״ה סעיפים א-ה".
  reference text,

  due_date date,
  completed_at timestamptz,

  -- Set when the user learned this unit from a specific lesson.
  lesson_id uuid references lessons(id) on delete set null,

  created_at timestamptz not null default now()
);

create unique index if not exists study_track_items_order_idx
  on study_track_items(user_id, track_id, ordinal);
create index if not exists study_track_items_due_idx
  on study_track_items(user_id, due_date)
  where completed_at is null;

alter table study_track_items enable row level security;

-- ----------------------------------------------------------------------------
-- havruta_threads / havruta_messages — the AI study partner.
--
-- A thread is anchored to what is being discussed (a summary, a lesson, a
-- book) so the debate has a subject, and `mode` decides how the model
-- behaves: challenging, clarifying, or reconciling two of the user's own
-- notes.
-- ----------------------------------------------------------------------------
create table if not exists havruta_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,

  subject_type text not null check (subject_type in ('summary', 'lesson', 'book', 'concept', 'contradiction')),
  subject_id text not null,

  mode text not null default 'debate' check (mode in ('debate', 'clarify', 'contradiction')),

  title text,
  closed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists havruta_threads_subject_idx
  on havruta_threads(user_id, subject_type, subject_id);

alter table havruta_threads enable row level security;

create trigger havruta_threads_set_updated_at
  before update on havruta_threads
  for each row execute function set_updated_at();

create table if not exists havruta_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  thread_id uuid not null references havruta_threads(id) on delete cascade,

  role text not null check (role in ('user', 'assistant')),
  content text not null,

  -- Sources the assistant leaned on for this turn, so a challenge can be
  -- checked rather than taken on faith:
  -- [{ type, id, label, ref }].
  citations jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists havruta_messages_thread_idx
  on havruta_messages(user_id, thread_id, created_at);

alter table havruta_messages enable row level security;

-- ----------------------------------------------------------------------------
-- contradiction_alerts — "this contradicts what you wrote a month ago".
--
-- A row per detected pair, with a status, because the useful behaviour is
-- *not* to re-raise something the user has already thought about and
-- dismissed. Without the status this feature becomes a nag.
-- ----------------------------------------------------------------------------
create table if not exists contradiction_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,

  -- Both sides are polymorphic: a new summary can contradict an older
  -- summary, a lesson's content, or a concept definition.
  left_type text not null check (left_type in ('summary', 'lesson', 'concept')),
  left_id text not null,
  right_type text not null check (right_type in ('summary', 'lesson', 'concept')),
  right_id text not null,

  -- The model's account of the conflict, in Hebrew, shown to the user.
  explanation text not null,

  confidence real not null default 0.5 check (confidence >= 0 and confidence <= 1),

  status text not null default 'open' check (status in ('open', 'dismissed', 'resolved')),

  -- Set when the user opened a havruta thread to work through it.
  thread_id uuid references havruta_threads(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One alert per pair, in one direction. The writer normalises the pair order
-- (lib/torah/contradictions.ts) before insert, so A-vs-B and B-vs-A cannot
-- both exist and produce two alerts for one conflict.
create unique index if not exists contradiction_alerts_pair_idx
  on contradiction_alerts(user_id, left_type, left_id, right_type, right_id);
create index if not exists contradiction_alerts_open_idx
  on contradiction_alerts(user_id, created_at desc)
  where status = 'open';

alter table contradiction_alerts enable row level security;

create trigger contradiction_alerts_set_updated_at
  before update on contradiction_alerts
  for each row execute function set_updated_at();
