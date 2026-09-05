-- Torah Space overhaul: one study-item model for summaries, video lessons
-- and source texts.
--
-- Extends `summaries` rather than adding study_videos / study_sources
-- tables. Those would each need their own copy of section_id, sort_order,
-- entity_type/entity_id and tags, plus their own ordering logic — and the
-- feature explicitly requires mixing all three inside one section, ordered
-- together. Three tables cannot be ordered against each other without a
-- fourth join table carrying the order, at which point the "unified
-- relational structure" is neither unified nor simpler.
--
-- The cost is an honest one: the table name no longer matches its contents.
-- Renaming it would break every existing repo, action, mapper and query for
-- a cosmetic gain, so the name stays and this comment records why.

alter table summaries add column if not exists kind text not null default 'summary'
  check (kind in ('summary', 'video', 'source'));

-- For a video this is the YouTube link; for a source, the reference URL.
-- Null for a plain written summary.
alter table summaries add column if not exists url text;

-- Filtering a section by kind is the common read ("show me this section's
-- videos"), so it is worth an index alongside the existing section ordering.
create index if not exists summaries_kind_idx on summaries(user_id, kind);
