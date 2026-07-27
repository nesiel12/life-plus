-- Finances Space follow-up: adds a `title` field distinct from `category`
-- (title = what this specific transaction was, e.g. "קניות בסופר";
-- category = the general bucket it belongs to, e.g. "מכולת") — the
-- original 20260726000003 migration only had category. Backfilled from
-- category for any existing rows rather than a fabricated placeholder,
-- since category is real data and a reasonable stand-in until edited.
--
-- Note: 20260726000003_transactions.sql was already applied (tracked by
-- filename in _migrations), so it can't be edited in place to add this
-- column — a new migration is required even though this is a small,
-- additive change to the same table.

alter table transactions add column title text;
update transactions set title = category where title is null;
alter table transactions alter column title set not null;
