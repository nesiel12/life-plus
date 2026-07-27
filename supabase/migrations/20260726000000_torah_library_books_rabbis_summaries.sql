-- Torah Space library — Books, Rabbis, and Summaries as first-class
-- entities (Torah Library Experience v1), the same shape `people` already
-- has: user-scoped, RLS enabled with no policies defined (see
-- 20260720000000_init.sql's header — the service-role key + explicit
-- user_id filtering in lib/db/*.ts is the real tenant boundary today, not
-- RLS). knowledge_entries (Shiurim) is untouched by this migration.

create table books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  author text,
  category text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index books_user_id_idx on books(user_id);

alter table books enable row level security;

create trigger books_set_updated_at
  before update on books
  for each row execute function set_updated_at();

create table rabbis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  title text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rabbis_user_id_idx on rabbis(user_id);

alter table rabbis enable row level security;

create trigger rabbis_set_updated_at
  before update on rabbis
  for each row execute function set_updated_at();

-- A user-written summary note, distinct from knowledge_entries.summary
-- (which is always tied to one uploaded/extracted shiur) — this is
-- standalone, composed directly in the Summaries tab.
create table summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  content text not null,
  summary_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index summaries_user_id_date_idx on summaries(user_id, summary_date desc);

alter table summaries enable row level security;

create trigger summaries_set_updated_at
  before update on summaries
  for each row execute function set_updated_at();
