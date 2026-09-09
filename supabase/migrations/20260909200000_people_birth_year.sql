-- An optional birth YEAR for a person, alongside the existing "MM-DD"
-- `birthday`.
--
-- `birthday` stays the source of truth for recurrence (the reminder, the
-- "in N days" countdown) — a birthday recurs every year and has no year.
-- This column is pure enrichment: when the user knows it, the Family card
-- can show an age. Nullable, and meaningless without `birthday` set.

alter table people
  add column birth_year smallint check (birth_year is null or birth_year between 1900 and 2100);
