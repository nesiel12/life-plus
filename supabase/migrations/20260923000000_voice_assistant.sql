-- ----------------------------------------------------------------------------
-- voice_sessions / voice_messages — the עוזר קולי's own conversation history.
--
-- Same shape as havruta_threads/havruta_messages (20260916000002), on purpose:
-- both are "a session anchors a back-and-forth, messages belong to it, newest
-- session first, oldest message first" — reusing the proven shape instead of
-- inventing a second one. No subject/mode columns here, since a voice session
-- isn't anchored to a summary/lesson/book the way a Havruta thread is; it's a
-- standalone conversation, closer to the AI Companion's own chat_messages
-- table, kept separate from it because it has a very different producer (a
-- spoken turn, not a typed one) and its own history view
-- (VoiceHistoryDrawer.tsx) rather than sharing the Companion's chat drawer.
-- ----------------------------------------------------------------------------

create table if not exists voice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,

  -- Set from the first user turn once it arrives (see appendVoiceMessageAction),
  -- not required on insert — a session exists before it has a first message.
  title text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists voice_sessions_user_updated_idx
  on voice_sessions(user_id, updated_at desc);

alter table voice_sessions enable row level security;

create trigger voice_sessions_set_updated_at
  before update on voice_sessions
  for each row execute function set_updated_at();

create table if not exists voice_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  session_id uuid not null references voice_sessions(id) on delete cascade,

  role text not null check (role in ('user', 'assistant')),
  content text not null,

  created_at timestamptz not null default now()
);

create index if not exists voice_messages_session_idx
  on voice_messages(user_id, session_id, created_at);

alter table voice_messages enable row level security;
