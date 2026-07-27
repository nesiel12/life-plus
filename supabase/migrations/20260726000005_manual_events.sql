-- Time & Calendar Space follow-up: manual (user-created, not Google
-- Calendar-sourced) events, so the Day Carousel/Timeline (Phase 5) can
-- show something the user scheduled themselves alongside real Google
-- Calendar events and Atlas tasks.
--
-- category reuses the existing moment_category enum (init migration) —
-- the same life-area vocabulary moments/upcoming_events already use,
-- rather than a new free-text taxonomy, so an event tagged "family" means
-- the same thing everywhere in the app.
--
-- linked_contact_ids is a plain uuid[] (not a join table) — a lean,
-- app-validated reference to people(id) rather than DB-enforced
-- referential integrity for a first pass; the multi-select UI only ever
-- offers real person ids already in the store.

create table manual_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  category moment_category,
  reminder_minutes integer check (reminder_minutes is null or reminder_minutes > 0),
  linked_contact_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time)
);

create index manual_events_user_id_idx on manual_events(user_id);
create index manual_events_user_id_start_idx on manual_events(user_id, start_time);

alter table manual_events enable row level security;

create trigger manual_events_set_updated_at
  before update on manual_events
  for each row execute function set_updated_at();
