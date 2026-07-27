-- Finances Pro: Work & Shifts — extends transactions to optionally carry
-- an hourly work-shift's own structure (employer, hourly rate, start/end
-- time — the amount itself is computed client-side from these and saved
-- like any other amount, not recomputed server-side) or mark a plain
-- income row as a recurring fixed salary. A shift is still just an income
-- transaction with extra structure, not a new entity, so this is an
-- ALTER on the existing table rather than a new one. All new columns are
-- nullable (or boolean-with-default), so every existing transaction row
-- stays valid as-is.

alter table transactions add column is_shift boolean not null default false;
alter table transactions add column hourly_rate numeric(10, 2);
alter table transactions add column shift_start timestamptz;
alter table transactions add column shift_end timestamptz;
alter table transactions add column employer text;
alter table transactions add column is_recurring boolean not null default false;

alter table transactions add constraint transactions_shift_times_check
  check (shift_end is null or shift_start is null or shift_end > shift_start);
