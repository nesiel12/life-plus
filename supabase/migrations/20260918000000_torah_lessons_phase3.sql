-- ============================================================================
-- מרחב תורה — Phase 3: the lessons pipeline runs, and "לתרגל" practises it.
--
-- Builds on 20260916000001 (lessons, transcripts, segments, sources) and
-- 20260916000002 (chunks, questions, attempts, SRS). Additive only.
--
-- THE PROCESSING MODEL, in one paragraph. A 60-minute shiur cannot be
-- transcribed inside one serverless request, so nothing here tries to. The
-- upload route creates the row and returns. Work happens in small, resumable
-- STEPS — one transcription window, then the next, then analysis — each run
-- under a short LEASE on the row. Whoever holds no lease may take the next
-- step: the cron job (scripts/cron.ts → lesson_pipeline), or the lesson page's
-- own status poll while the user is watching. A worker that dies mid-step
-- simply lets its lease expire and the step is retried; progress already
-- written (the transcript lines of every finished window) is never redone.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- lessons — processing state, results, and the media facts the worker needs.
-- ----------------------------------------------------------------------------

-- 'uploading': the row exists and a signed upload URL was issued, but the
-- bytes have not been confirmed. Workers never claim it — processing a file
-- that is still in flight would transcribe half a shiur.
alter table lessons drop constraint if exists lessons_status_check;
alter table lessons add constraint lessons_status_check
  check (status in ('uploading', 'pending', 'transcribing', 'analyzing', 'ready', 'failed'));

-- Step cursor and partial results — { phase, windows, nextWindow, geminiFile,
-- pausedUntil, … }. jsonb because each phase keeps different state, and the
-- worker is its only writer.
alter table lessons add column if not exists progress jsonb not null default '{}'::jsonb;

-- The lease. A worker sets it to now() + a few minutes when it claims a step
-- and clears it when the step ends; see claim_lesson_step() below.
alter table lessons add column if not exists lease_until timestamptz;

-- Consecutive failed steps. Reset by any step that succeeds. A step that keeps
-- failing (a video that became private, an unreadable file) must end in
-- 'failed' with a reason, not retry forever.
alter table lessons add column if not exists attempts integer not null default 0;

alter table lessons add column if not exists media_mime text;
alter table lessons add column if not exists media_size_bytes bigint;

-- Hebrew results of the analysis step.
alter table lessons add column if not exists summary text;
alter table lessons add column if not exists key_points jsonb not null default '[]'::jsonb;

-- The uploader or the YouTube channel, for display.
alter table lessons add column if not exists speaker text;
alter table lessons add column if not exists processed_at timestamptz;

create index if not exists lessons_active_idx
  on lessons(updated_at)
  where status in ('pending', 'transcribing', 'analyzing');

-- ----------------------------------------------------------------------------
-- lesson_transcripts — timed lines for the interactive transcript.
--
-- [{ start, end, text }] in seconds. full_text stays the searchable,
-- AI-readable form; `lines` is what the player follows along with.
-- ----------------------------------------------------------------------------
alter table lesson_transcripts add column if not exists lines jsonb not null default '[]'::jsonb;

-- ----------------------------------------------------------------------------
-- lesson_sources — what is needed to link a citation to the library later.
--
-- A citation resolved against Sefaria knows its work ("Bava Metzia") and its
-- Hebrew label ("בבא מציעא נ״ט ב"). Storing the work lets the lesson page
-- re-match the source to a book the user adds AFTER the lesson was analysed,
-- with no network call and no re-analysis.
-- ----------------------------------------------------------------------------
alter table lesson_sources add column if not exists sefaria_index text;
alter table lesson_sources add column if not exists he_ref text;
alter table lesson_sources add column if not exists he_index_title text;
-- How many times the source was cited in the lesson.
alter table lesson_sources add column if not exists mentions integer not null default 1;

-- ----------------------------------------------------------------------------
-- practice — structured grading and chunk-level flashcards.
-- ----------------------------------------------------------------------------

-- [{ criterion, met, note }] — which rubric points an answer hit, so the
-- feedback can show a checklist instead of a paragraph.
alter table practice_attempts add column if not exists rubric_results jsonb not null default '[]'::jsonb;

-- The chunk a card was generated from, so a chunk's practice screen can show
-- "its" cards and the lesson page can show mastery per part.
alter table srs_cards add column if not exists chunk_id uuid references learning_chunks(id) on delete set null;
create index if not exists srs_cards_chunk_idx on srs_cards(user_id, chunk_id);

-- ----------------------------------------------------------------------------
-- claim_lesson_step — the lease, taken atomically.
--
-- A single UPDATE … WHERE lease is free … RETURNING, so two workers racing for
-- the same lesson (the cron sweep and an open lesson page) cannot both win:
-- Postgres row locking makes exactly one of them see the row. `p_user_id` may
-- be null for the cron sweep, which works across users.
-- ----------------------------------------------------------------------------
create or replace function claim_lesson_step(
  p_lesson_id uuid,
  p_user_id uuid,
  p_lease_seconds integer
)
returns setof lessons
language sql
as $$
  update lessons
     set lease_until = now() + make_interval(secs => p_lease_seconds)
   where id = p_lesson_id
     and (p_user_id is null or user_id = p_user_id)
     and status in ('pending', 'transcribing', 'analyzing')
     and (lease_until is null or lease_until < now())
     and (
       (progress ->> 'pausedUntil') is null
       or (progress ->> 'pausedUntil')::timestamptz < now()
     )
  returning *;
$$;

-- The sweep's work list: active lessons whose lease is free, oldest first.
create or replace function list_claimable_lessons(p_limit integer)
returns table (id uuid, user_id uuid)
language sql
stable
as $$
  select l.id, l.user_id
    from lessons l
   where l.status in ('pending', 'transcribing', 'analyzing')
     and (l.lease_until is null or l.lease_until < now())
     and (
       (l.progress ->> 'pausedUntil') is null
       or (l.progress ->> 'pausedUntil')::timestamptz < now()
     )
   order by l.updated_at asc
   limit p_limit;
$$;

-- ----------------------------------------------------------------------------
-- Storage — the private bucket for uploaded shiurim.
--
-- Private: every read is a short-lived signed URL issued after the owner
-- check in the API. 50 MB is the Supabase free-plan ceiling per object; the
-- uploader tells the user before they try. Audio types only.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lesson-media',
  'lesson-media',
  false,
  52428800,
  array[
    'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac',
    'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg', 'audio/flac', 'audio/x-flac'
  ]
)
on conflict (id) do nothing;
