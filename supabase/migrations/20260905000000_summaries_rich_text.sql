-- Advanced Summary System: rich text, draft state, and entity linking.
--
-- `content` (plain text) is kept, not replaced. Existing rows hold real user
-- summaries written before the editor existed, and dropping the column would
-- lose them. `content_html` is the editor's own representation; a row with
-- only `content` still renders, and the editor seeds itself from the plain
-- text on first open. New rows write both, so anything reading `content`
-- (search, AI context) keeps working unchanged.
--
-- `is_draft` is what makes pause-and-resume real rather than a client-side
-- illusion: a draft survives closing the tab, and the summaries list can
-- show "you left this unfinished" instead of silently hiding it.

alter table summaries add column if not exists content_html text;
alter table summaries add column if not exists is_draft boolean not null default false;

-- The entity this summary is *about*. Nullable: a standalone summary that
-- belongs to no book or rabbi is legitimate and must stay valid.
--
-- Deliberately a (type, id) pair rather than three nullable foreign keys.
-- Books, rabbis and topics live in different tables (and "topic" has no
-- table at all), so real FKs would mean one nullable column per entity kind
-- plus a check constraint keeping exactly one populated — which grows every
-- time an entity type is added. The trade-off is no referential integrity
-- here, so readers must tolerate a dangling id; lib/summaries/entityRef.ts
-- resolves and drops unresolvable references rather than rendering a broken
-- link.
alter table summaries add column if not exists entity_type text
  check (entity_type is null or entity_type in ('book', 'rabbi', 'person', 'topic'));
alter table summaries add column if not exists entity_id text;

-- Every entity @mentioned in the body, so an entity page can find the
-- summaries that reference it without scanning HTML. jsonb array of
-- { type, id, label }.
alter table summaries add column if not exists mentions jsonb not null default '[]'::jsonb;

create index if not exists summaries_entity_idx on summaries(user_id, entity_type, entity_id);
create index if not exists summaries_draft_idx on summaries(user_id, is_draft);
