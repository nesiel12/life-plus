-- Time & Tasks Space (Phase 5) — tasks as a first-class entity, same shape
-- books/rabbis already have: user-scoped, RLS enabled with no policies
-- defined (see 20260720000000_init.sql's header for the access-model
-- rationale — the service-role key + explicit user_id filtering in
-- lib/db/*.ts is the real tenant boundary today, not RLS).
--
-- status is plain text with a check constraint, not a Postgres enum —
-- matching how people.birthday/anniversary already validate a text column
-- via `check (... ~ ...)` rather than adding a new enum type for a
-- three-value field. is_high_priority and the status distinction beyond
-- todo/done exist now so the Personal DNA-driven auto-prioritization this
-- phase anticipates has real data to work with later; the initial UI only
-- drives a binary todo/done toggle.

create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo', 'in-progress', 'done')),
  due_date timestamptz,
  is_high_priority boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_user_id_idx on tasks(user_id);
create index tasks_user_id_status_idx on tasks(user_id, status);

alter table tasks enable row level security;

create trigger tasks_set_updated_at
  before update on tasks
  for each row execute function set_updated_at();
