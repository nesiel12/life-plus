-- Photo Memories + Google Photos connection (Sprint 3).
--
-- ARCHITECTURAL DECISION ON RECORD (see docs/GOOGLE_PHOTOS_CONSTRAINTS.md):
-- this app stores downscaled copies of photos the user explicitly picked.
-- That deliberately overrides the original "store references only, never
-- download" instruction, because that instruction is not implementable:
-- Google Photos baseUrls expire in ~60 minutes, the Picker API's mediaItems
-- resource has no get/batchGet by id (only list-by-sessionId), and session
-- expiry revokes access to the picked media itself. Storing only an id yields
-- an image that is permanently broken within the hour. Approved explicitly by
-- the account owner on 2026-09-03.
--
-- Storage shape: bytea, not a data: URL. people.avatar_url uses a data: URL
-- (see 20260720000010) and that was right for one small avatar per person, but
-- a photo corpus is the "real need for larger media" that migration's comment
-- anticipated. base64 inflates by ~33%, and these rows are numerous, so bytes
-- go in as bytes and are streamed by an API route rather than embedded in
-- JSON. If the corpus ever outgrows Postgres, the migration path is Supabase
-- Storage and only the read route changes.

create table photo_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,

  -- When the photo was actually taken, which is what anniversary matching
  -- keys on — NOT when it was uploaded or ingested.
  taken_at timestamptz not null,

  -- Google's media item id. Storing this indefinitely is explicitly permitted
  -- by Google's own best-practices page. It is kept for provenance and
  -- de-duplication; it is deliberately NOT relied on for re-fetching, because
  -- it is not independently resolvable.
  google_media_id text,

  source text not null default 'picker' check (source in ('picker', 'takeout', 'upload')),

  -- The downscaled derivative.
  image_data bytea not null,
  mime_type text not null default 'image/jpeg',
  width integer not null,
  height integer not null,
  byte_size integer not null,

  -- AI-written Hebrew caption, generated once and cached so a card does not
  -- re-bill an LLM call on every dashboard render.
  caption text,
  caption_generated_at timestamptz,

  created_at timestamptz not null default now()
);

-- Deliberately NO month/day expression index. Postgres rejects date_part on a
-- timestamptz in an index (it is STABLE, not IMMUTABLE, because the result
-- depends on the session TimeZone), and the obvious workaround — pinning the
-- extraction to UTC — would index a different day than the one the feature
-- means. "A year ago today" is a local wall-clock idea: a photo taken at 23:30
-- local is the 3rd to the user and the 4th in UTC. Matching therefore happens
-- in lib/memories/anniversary.ts using local time, and this index just serves
-- the corpus load. Revisit only if the corpus outgrows a full scan, and if so
-- store a precomputed local month/day pair rather than deriving it here.
create index photo_memories_user_taken_idx on photo_memories (user_id, taken_at desc);

-- Re-picking the same photo should update rather than duplicate.
create unique index photo_memories_user_google_id_idx
  on photo_memories (user_id, google_media_id)
  where google_media_id is not null;

-- Google Photos connection, kept separate from the sign-in session on purpose.
-- Adding a sensitive Photos scope to the sign-in scope set would force every
-- user to re-consent merely to log in and pull the whole app into a heavier
-- OAuth verification posture. This is incremental authorization instead: an
-- opt-in grant the user can revoke without affecting sign-in.
create table google_photos_credentials (
  user_id uuid primary key references users(id) on delete cascade,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz not null,
  scope text not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Picker sessions are short-lived server-side state. Retained only so a poll
-- can be attributed to the right user and purpose; rows are disposable.
create table google_photos_picker_sessions (
  id text primary key,
  user_id uuid not null references users(id) on delete cascade,
  purpose text not null check (purpose in ('memories', 'avatar')),
  -- For purpose='avatar', which person the picked photo is for.
  target_person_id uuid references people(id) on delete cascade,
  picker_uri text not null,
  expire_time timestamptz,
  media_items_set boolean not null default false,
  created_at timestamptz not null default now()
);

create index google_photos_picker_sessions_user_idx
  on google_photos_picker_sessions (user_id, created_at desc);

-- RLS enabled to match every other table in this schema. Server code reaches
-- Postgres with the service-role key and scopes by user_id explicitly (see
-- lib/db/createUserScopedRepo.ts), so these tables are never exposed to an
-- anon client directly; enabling RLS keeps that guarantee true by default if
-- one ever is.
alter table photo_memories enable row level security;
alter table google_photos_credentials enable row level security;
alter table google_photos_picker_sessions enable row level security;

create trigger google_photos_credentials_set_updated_at
  before update on google_photos_credentials
  for each row execute function set_updated_at();
