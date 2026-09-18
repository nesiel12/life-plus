-- ============================================================================
-- מרחב תורה — "שיעורים": the upload → transcribe → analyse pipeline.
--
-- WHY NEW TABLES RATHER THAN EXTENDING knowledge_entries:
--
-- knowledge_entries is a *log* — one row per shiur learned, with a topic, a
-- source and a hand-or-AI-written summary (20260720000000_init.sql). It is
-- read by the dashboard, the streak calculation, insights and the review
-- picker. A lesson here is a different thing: a piece of media with a
-- duration, a processing lifecycle that can fail halfway, a transcript that
-- can run to tens of thousands of words, and dozens of child rows
-- (segments, citations, chunks, questions). Stuffing that into the log row
-- would give every existing consumer a payload it does not want, and give
-- this pipeline a schema it cannot express.
--
-- They are linked instead: lessons.knowledge_entry_id points at the log row
-- when a processed lesson is also logged as learned.
--
-- STATE MACHINE. `status` is explicit because every step here can fail on
-- someone else's infrastructure — Whisper, YouTube, the model. A row that
-- silently stays empty is indistinguishable from one still working, which is
-- the failure mode the AppShell bootstrap error was: invisible, unretryable.
-- Every terminal failure records `error` so the UI can say what broke and
-- offer the retry.
-- ============================================================================

create table if not exists lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,

  title text not null,

  kind text not null check (kind in ('audio', 'youtube', 'pdf')),

  -- For youtube: the watch URL. For audio/pdf: null, with the bytes at
  -- storage_path instead.
  source_url text,

  -- Supabase Storage object path for an uploaded file. Not the bytes: a
  -- shiur is routinely 60+ minutes of audio, and bytea in the row would
  -- make every `select *` on this table pull hundreds of megabytes.
  storage_path text,

  -- Extracted from the media once known. Null until transcription reports it.
  duration_seconds integer,

  status text not null default 'pending' check (status in (
    'pending',       -- row created, nothing started
    'transcribing',  -- speech-to-text in flight
    'analyzing',     -- segmenting + citation extraction in flight
    'ready',         -- everything succeeded
    'failed'         -- see error; retryable
  )),

  -- Human-readable Hebrew failure reason, shown directly in the UI. Cleared
  -- on a successful retry.
  error text,

  -- Optional anchors into the rest of the graph. Both nullable and both
  -- ON DELETE SET NULL: losing the book must not lose the shiur about it.
  book_id uuid references books(id) on delete set null,
  rabbi_id uuid references rabbis(id) on delete set null,

  -- The seder-log row this lesson was recorded as, if the user logged it.
  knowledge_entry_id uuid references knowledge_entries(id) on delete set null,

  lesson_date date not null default current_date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lessons_user_date_idx on lessons(user_id, lesson_date desc);
create index if not exists lessons_user_status_idx on lessons(user_id, status);
create index if not exists lessons_book_idx on lessons(user_id, book_id);
create index if not exists lessons_rabbi_idx on lessons(user_id, rabbi_id);

alter table lessons enable row level security;

create trigger lessons_set_updated_at
  before update on lessons
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- lesson_transcripts — the full text, one row per lesson.
--
-- Separate table, not a column on `lessons`, for one concrete reason: a
-- 90-minute shiur transcribes to ~15,000 words. Every list query on
-- `lessons` (the index page, the dashboard widget, the graph builder) would
-- otherwise drag that text along for every row it returns. One-to-one tables
-- exist precisely for columns you almost never want in the parent's SELECT.
-- ----------------------------------------------------------------------------
create table if not exists lesson_transcripts (
  lesson_id uuid primary key references lessons(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,

  full_text text not null,

  -- 'he' for the overwhelming majority here, but Whisper reports what it
  -- heard and a shiur in English or Yiddish is not unusual.
  language text,

  -- Which engine produced this — 'whisper-1', 'youtube-captions', 'pdf-text'.
  -- Recorded so a re-run with a better engine can be told apart from a
  -- re-run of the same one, and so a captions-derived transcript (no
  -- word-level confidence) is distinguishable from a real STT pass.
  provider text not null,

  word_count integer,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lesson_transcripts_user_idx on lesson_transcripts(user_id);

alter table lesson_transcripts enable row level security;

create trigger lesson_transcripts_set_updated_at
  before update on lesson_transcripts
  for each row execute function set_updated_at();

-- Hebrew full-text search over transcripts.
--
-- Postgres ships no Hebrew stemmer, so 'simple' is the honest configuration:
-- it lowercases and splits on whitespace/punctuation without pretending to
-- know Hebrew morphology. That means "לימוד" will not match "ללמוד" — a real
-- limitation, recorded here rather than papered over with an English stemmer
-- that would mangle Hebrew tokens outright. It is still dramatically better
-- than ILIKE '%…%' across every transcript, which is what the alternative is.
create index if not exists lesson_transcripts_fts_idx
  on lesson_transcripts using gin (to_tsvector('simple', full_text));

-- ----------------------------------------------------------------------------
-- lesson_segments — the "smart timestamps" (00:00 פתיחה, 15:30 ראיות …).
-- ----------------------------------------------------------------------------
create table if not exists lesson_segments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  lesson_id uuid not null references lessons(id) on delete cascade,

  start_seconds integer not null check (start_seconds >= 0),

  -- Null on the final segment, which runs to the end of the media. Encoding
  -- "to the end" as null rather than as the duration means a later, more
  -- accurate duration reading does not leave a stale end time behind.
  end_seconds integer check (end_seconds is null or end_seconds > start_seconds),

  title text not null,
  summary text,

  -- Explicit ordering rather than relying on start_seconds, so a user can
  -- reorder or merge segments without rewriting timestamps.
  sort_order integer not null default 0,

  created_at timestamptz not null default now()
);

create index if not exists lesson_segments_lesson_idx
  on lesson_segments(user_id, lesson_id, sort_order);

alter table lesson_segments enable row level security;

-- ----------------------------------------------------------------------------
-- lesson_sources — the Sources Panel.
--
-- Every verse, gemara reference or sefer the speaker quoted, with the full
-- quoted text fetched where a provider has it, and a link into the user's
-- own library when they own that book.
-- ----------------------------------------------------------------------------
create table if not exists lesson_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  lesson_id uuid not null references lessons(id) on delete cascade,
  segment_id uuid references lesson_segments(id) on delete set null,

  -- Exactly what the speaker said — "בבא מציעא נ״ט", "כמו שכתוב בשולחן ערוך".
  -- Kept verbatim so the panel can show the citation as heard even when
  -- normalisation fails.
  raw_citation text not null,

  -- The canonical form, when it could be parsed: "Bava Metzia 59a". Null
  -- when the parse failed, which is a normal outcome, not an error — the
  -- raw citation still displays.
  normalized_ref text,

  source_kind text not null default 'other' check (source_kind in (
    'verse',    -- תנ״ך
    'talmud',
    'halacha',
    'book',
    'other'
  )),

  -- The fetched text of the citation, when a provider returned it.
  quoted_text text,

  -- Sefaria's own ref string, kept separately from normalized_ref so a
  -- provider change does not corrupt the app's own normalisation.
  sefaria_ref text,

  -- Set when the cited work is a book the user already has. This is what
  -- turns the Sources Panel into navigation instead of a bibliography.
  resolved_book_id uuid references books(id) on delete set null,

  -- Where in the media it was said, so clicking a source can seek there.
  at_seconds integer,

  -- 0..1 from the extraction model. A shaky citation should render as one.
  confidence real not null default 1 check (confidence >= 0 and confidence <= 1),

  created_at timestamptz not null default now()
);

create index if not exists lesson_sources_lesson_idx on lesson_sources(user_id, lesson_id);
create index if not exists lesson_sources_book_idx on lesson_sources(user_id, resolved_book_id);

-- Re-running extraction over a lesson updates rather than duplicates. The
-- coalesce mirrors concept_mentions: a null at_seconds must still collide
-- with another null, and in a plain unique index two nulls never match.
create unique index if not exists lesson_sources_unique_idx
  on lesson_sources(user_id, lesson_id, raw_citation, coalesce(at_seconds, -1));

alter table lesson_sources enable row level security;
