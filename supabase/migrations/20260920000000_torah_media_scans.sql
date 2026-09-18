-- ============================================================================
-- מרחב תורה — universal audio attachments and the handwriting scanner.
--
-- Two additive features, one migration:
--
--   1. entity_audio — a recording attached to ANY entity in the space: a book,
--      a rabbi, a lesson, a concept or a note. The lessons table stays exactly
--      what it is (a shiur that gets transcribed, analysed, chunked and turned
--      into practice); this is the lighter thing the brief asks for — "keep the
--      recording here, and transcribe it when I ask". Modelling an attachment
--      as a lesson would have meant every voice note growing chapters, sources,
--      practice questions and flashcards nobody asked for.
--
--   2. handwriting_scans — the log of a photographed page that Gemini Vision
--      read. Kept as its own row rather than only producing a summary, because
--      the image, the model's confidence and the text it produced are the only
--      way to answer "did it read this right?" after the fact.
--
-- Tenancy is the same as everywhere else: RLS enabled with no policies, the
-- service-role key plus explicit user_id filtering in lib/db/* is the boundary
-- (see 20260720000000_init.sql).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- entity_audio
-- ----------------------------------------------------------------------------
create table if not exists entity_audio (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,

  -- Polymorphic, exactly like kg_edges: `text` because a concept id is a uuid
  -- but a future node kind may not be, and because these rows must survive the
  -- entity being deleted long enough for the cleanup path to run.
  entity_type text not null check (entity_type in ('book', 'rabbi', 'lesson', 'concept', 'summary')),
  entity_id text not null,

  title text not null,

  -- `<userId>/attachments/<id>/audio.<ext>` in the private lesson-media bucket
  -- (20260918000000). Reused deliberately: same privacy model, same 50 MB cap,
  -- same audio mime whitelist — a second bucket would be a second set of rules
  -- to keep in step for no gain.
  storage_path text not null,
  mime text not null,
  size_bytes bigint,
  duration_seconds integer,

  -- Where it came from. A browser recording and an uploaded file are handled
  -- identically after upload, but the UI labels them differently and a
  -- recording is the one a user is most likely to have no other copy of.
  source text not null default 'upload' check (source in ('upload', 'recording')),

  -- uploading → stored → (transcribing → ready | failed)
  --
  -- Transcription is ON DEMAND: an attachment sits at `stored` indefinitely and
  -- costs nothing. Only "תמלל הקלטה זו" moves it to `transcribing`.
  status text not null default 'uploading'
    check (status in ('uploading', 'stored', 'transcribing', 'ready', 'failed')),

  transcript text,
  -- [{ start, end, text }] in seconds — the same shape as
  -- lesson_transcripts.lines, so lib/torah/lessons/transcript.ts reads both and
  -- the player can seek to a line.
  transcript_lines jsonb not null default '[]'::jsonb,
  transcript_provider text,

  -- Hebrew reason when status = 'failed'.
  error text,

  -- The worker's resumable cursor: { phase, windows, nextWindow, geminiFile, … }.
  progress jsonb not null default '{}'::jsonb,
  lease_until timestamptz,
  attempts integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The query every entity page runs: "what is attached to this one?"
create index if not exists entity_audio_entity_idx
  on entity_audio(user_id, entity_type, entity_id, created_at desc);

-- The sweep's work list. Partial, so stored/ready rows cost nothing in it.
create index if not exists entity_audio_active_idx
  on entity_audio(lease_until)
  where status = 'transcribing';

alter table entity_audio enable row level security;

create trigger entity_audio_set_updated_at
  before update on entity_audio
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- claim_audio_step / list_claimable_audio — the same lease as the lessons
-- pipeline (20260918000000), for the same reason: the transcribe request, an
-- open page's polling and the cron sweep can all be working at once, and
-- exactly one of them may hold a step.
-- ----------------------------------------------------------------------------
create or replace function claim_audio_step(
  p_audio_id uuid,
  p_user_id uuid,
  p_lease_seconds integer
)
returns setof entity_audio
language sql
as $$
  update entity_audio
     set lease_until = now() + make_interval(secs => p_lease_seconds)
   where id = p_audio_id
     and (p_user_id is null or user_id = p_user_id)
     and status = 'transcribing'
     and (lease_until is null or lease_until < now())
     and (
       (progress ->> 'pausedUntil') is null
       or (progress ->> 'pausedUntil')::timestamptz < now()
     )
  returning *;
$$;

create or replace function list_claimable_audio(p_limit integer)
returns table (id uuid, user_id uuid)
language sql
stable
as $$
  select a.id, a.user_id
    from entity_audio a
   where a.status = 'transcribing'
     and (a.lease_until is null or a.lease_until < now())
     and (
       (a.progress ->> 'pausedUntil') is null
       or (a.progress ->> 'pausedUntil')::timestamptz < now()
     )
   order by a.created_at
   limit greatest(1, p_limit);
$$;

-- ----------------------------------------------------------------------------
-- handwriting_scans
-- ----------------------------------------------------------------------------
create table if not exists handwriting_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,

  -- The photographed page(s), in the private torah-scans bucket. Kept after
  -- saving: the whole review step is "does this text match the page?", and
  -- that question outlives the review — a reader who doubts a line a month
  -- later can open the original.
  storage_paths jsonb not null default '[]'::jsonb,
  page_count integer not null default 1,

  -- What the model read, as Hebrew Markdown, and what the user kept after
  -- editing. `markdown` is the model's; `edited_markdown` is null until the
  -- user changes something, so "how good is the OCR really?" stays answerable.
  markdown text not null,
  edited_markdown text,
  title text,

  -- The model's own 0..1 confidence and the count of segments it marked
  -- unreadable. Both are shown; a scan that is 60% sure must not look like one
  -- that is 95% sure.
  confidence real check (confidence is null or (confidence >= 0 and confidence <= 1)),
  uncertain_count integer not null default 0,

  status text not null default 'draft' check (status in ('draft', 'saved', 'discarded')),

  -- Where it was filed, once saved.
  summary_id uuid references summaries(id) on delete set null,
  entity_type text check (entity_type is null or entity_type in ('book', 'rabbi', 'lesson', 'note')),
  entity_id text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists handwriting_scans_user_idx on handwriting_scans(user_id, created_at desc);

alter table handwriting_scans enable row level security;

create trigger handwriting_scans_set_updated_at
  before update on handwriting_scans
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- torah-scans bucket — private, images only.
--
-- Separate from lesson-media because the mime whitelist is the point of both:
-- a bucket that accepts audio AND images accepts an uploaded anything with a
-- renamed extension.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'torah-scans',
  'torah-scans',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;
