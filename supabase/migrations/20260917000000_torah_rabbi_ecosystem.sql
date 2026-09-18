-- ============================================================================
-- מרחב תורה — Phase 2: the Rabbi ecosystem and the rich Book page.
--
-- Additive only, like every Torah KG migration before it: nothing is renamed
-- or dropped, so every existing reader keeps working.
--
-- TWO KINDS OF "RELATED THING" LIVE HERE, AND THE SPLIT IS DELIBERATE.
--
--   * kg_edges (20260916000000) holds relationships between rows that EXIST
--     in the user's library — this rabbi taught that rabbi, this book was
--     authored by that rabbi.
--   * rabbis.lineage / rabbis.works hold what is KNOWN ABOUT a rabbi but not
--     (yet) in the library: the teachers Sefaria lists, the seforim he wrote.
--
-- Materialising every teacher and every sefer as a row the moment a profile
-- is enriched would flood the user's Rabbis and Books tabs with dozens of
-- entries they never added. So these are catalogue entries, and clicking one
-- is what promotes it into a real row (and writes the kg_edge) — the
-- "investigation loop" creates library entries only where the user actually
-- went.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- rabbis — a full profile.
-- ----------------------------------------------------------------------------

-- The world they lived in, as distinct from the story of their own life
-- (`bio`, 20260916000000). The profile renders them as separate sections.
alter table rabbis add column if not exists historical_context text;

-- ["ייסד את ישיבת ראדין", …] — short Hebrew lines.
alter table rabbis add column if not exists achievements jsonb not null default '[]'::jsonb;

-- Teachers and students known about this rabbi, whether or not they are in
-- the library: [{ name, relation: 'teacher'|'student', sefariaSlug?,
-- origin: 'import'|'ai', confidence }]. `origin` and `confidence` carry the
-- same load-bearing meaning they do on kg_edges: an AI guess must never
-- render like a fact Sefaria recorded.
alter table rabbis add column if not exists lineage jsonb not null default '[]'::jsonb;

-- The rabbi's bookshelf: [{ title, description?, year?, sefariaTitle?,
-- origin, confidence }]. Hebrew titles and Hebrew descriptions only.
alter table rabbis add column if not exists works jsonb not null default '[]'::jsonb;

-- Null = unknown. Drives whether the profile leads with contact/community
-- details (a living rav) or with the historical biography.
alter table rabbis add column if not exists is_contemporary boolean;

-- Contact & community. Real columns, not a jsonb blob: these are the fields
-- the user types and the profile links to directly (tel:, wa.me, a website).
-- Only ever written by the user — see suggested_links for the AI's side.
alter table rabbis add column if not exists phone text;
alter table rabbis add column if not exists whatsapp_url text;
alter table rabbis add column if not exists website_url text;
alter table rabbis add column if not exists youtube_channel_url text;
alter table rabbis add column if not exists email text;

-- Links a model proposed and nobody has confirmed:
-- [{ kind: 'website'|'youtube', url, label, confidence }]. Kept apart from
-- the columns above on purpose. A hallucinated phone number presented as
-- the rav's real one is worse than no number at all, so the model never
-- writes a contact column — it suggests, and the user promotes.
alter table rabbis add column if not exists suggested_links jsonb not null default '[]'::jsonb;

create index if not exists rabbis_user_name_idx on rabbis(user_id, name);

-- ----------------------------------------------------------------------------
-- books — the personal layer and the "what is inside" layer.
-- ----------------------------------------------------------------------------

-- ["הלכות שבת", "הלכות תפילה", …] — Hebrew topic chips for the book page.
alter table books add column if not exists key_topics jsonb not null default '[]'::jsonb;

-- The user's own verdict. Separate from `rating`, which is the provider's
-- aggregate — collapsing them would overwrite a community score with one
-- person's opinion, or the other way round.
alter table books add column if not exists personal_rating smallint
  check (personal_rating is null or (personal_rating >= 1 and personal_rating <= 5));
alter table books add column if not exists personal_review text;

-- Who recommended this sefer ("הרב שלי", "חברותא מהכולל") — the social
-- memory behind why a book is on the shelf at all.
alter table books add column if not exists recommended_by text;

alter table books add column if not exists isbn text;

-- ----------------------------------------------------------------------------
-- summaries.kind — audio lessons join video and source.
--
-- The book page has a dedicated audio section. Until the Phase 3 upload
-- pipeline lands, an audio lesson is a link to a hosted file (Kol HaLashon,
-- a yeshiva's site) — the same "title plus a url" shape video already uses,
-- so it belongs in the same study-items table rather than a new one.
-- ----------------------------------------------------------------------------
alter table summaries drop constraint if exists summaries_kind_check;
alter table summaries add constraint summaries_kind_check
  check (kind in ('summary', 'video', 'source', 'audio'));
