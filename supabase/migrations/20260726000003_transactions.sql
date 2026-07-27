-- Finances Space (Phase 6) — lean core: single currency (ILS, no currency
-- column), a positive `amount` plus an explicit `type` (income/expense)
-- rather than a signed amount, since that reads unambiguously in both
-- storage and any future aggregation (summing "income" and "expense" rows
-- separately is safer than trusting sign conventions everywhere). `type`
-- is plain text + check constraint, same convention tasks.status already
-- uses, not a new enum type for a two-value field. `category` is free
-- text (no categories table this pass — same choice books.category
-- already made). Mutable, so it gets updated_at + trigger like
-- books/rabbis/tasks/habits. User-scoped, RLS enabled with no policies
-- (see 20260720000000_init.sql's header for the access-model rationale).

create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  type text not null check (type in ('income', 'expense')),
  category text not null,
  transaction_date date not null default current_date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index transactions_user_id_idx on transactions(user_id);
create index transactions_user_id_date_idx on transactions(user_id, transaction_date desc);

alter table transactions enable row level security;

create trigger transactions_set_updated_at
  before update on transactions
  for each row execute function set_updated_at();
