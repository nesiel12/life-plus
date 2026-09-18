-- ============================================================================
-- מרחב תורה — Knowledge Graph, core layer.
--
-- THE CENTRAL DECISION: a property graph laid over the existing relational
-- tables, not a node/edge rewrite of them.
--
-- The obvious way to build "everything connects to everything" is one
-- `kg_nodes` table with a jsonb `properties` blob, and to migrate books,
-- rabbis and summaries into it. That is rejected here for three reasons:
--
--   1. `books`, `rabbis` and `summaries` already have ~30 consumers across
--      repos, mappers, actions, the Zustand store and the Torah UI. Moving
--      them into a node table is a rewrite of the whole module, not a
--      foundation for a new feature.
--   2. Real entities have real columns. A book has a cover URL, an ISBN, a
--      published year; a rabbi has birth/death years and a lineage. In a
--      jsonb blob none of that is typed, indexed, or constrainable.
--   3. The codebase already established the polymorphic-reference pattern:
--      summaries.entity_type/entity_id (20260905000000) and
--      lib/summaries/entityRef.ts point at (type, id) pairs with no foreign
--      key, and tolerate a dangling reference by design.
--
-- So: domain tables stay and get richer, and ONE typed edge table carries
-- every relationship between them. Recursive questions ("who taught the rabbi
-- who taught the author of this book?") are answered by the WITH RECURSIVE
-- traversal at the bottom of this file, which needs no schema change per new
-- relation kind.
--
-- Tenancy is the same as everywhere else in Atlas: RLS is enabled with no
-- policies, and the real boundary is the service-role key plus explicit
-- user_id filtering in lib/db/* (see 20260720000000_init.sql's header).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- kg_edges — every relationship in the Torah knowledge graph.
-- ----------------------------------------------------------------------------
create table if not exists kg_edges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,

  -- Polymorphic endpoints. `text` rather than `uuid` for the ids on purpose:
  -- most node kinds are uuid rows, but a `topic` node's id *is* its label
  -- (lib/summaries/entityRef.ts: "A topic's id is its label; it always
  -- resolves to itself"). Forcing uuid would mean either a junk table of
  -- topic rows or a second nullable id column, and both are worse than one
  -- text column that stores a uuid as text when it has one.
  from_type text not null,
  from_id text not null,
  to_type text not null,
  to_id text not null,

  -- The relation vocabulary, constrained here rather than in an enum type so
  -- adding one is an ALTER of this check, not a type migration with a
  -- rewrite. Directional: `authored_by` reads from→to as "book authored by
  -- rabbi", and the reverse direction is a traversal concern, not a second row.
  relation text not null check (relation in (
    'authored_by',    -- book    → rabbi
    'taught_by',      -- rabbi   → rabbi     (this rabbi's teacher)
    'quotes',         -- lesson/summary/book → book/concept
    'mentions',       -- summary/lesson → any
    'about',          -- lesson/summary → book/rabbi/concept
    'part_of',        -- book    → book      (a volume inside a work)
    'commentary_on',  -- book    → book
    'discusses',      -- lesson/summary → concept
    'related_to'      -- weakest link, AI-suggested association
  )),

  -- How strongly this edge is believed, 0..1. A user-drawn edge is 1; an
  -- AI-inferred one carries the model's own confidence so the UI can render
  -- a speculative link differently from an asserted one.
  weight real not null default 1 check (weight >= 0 and weight <= 1),

  -- Who asserted it. This is the difference between "the user said Rabbi X
  -- learned from Rabbi Y" and "a model guessed it from a transcript", and it
  -- must never be collapsed: an AI guess that renders identically to a user's
  -- own knowledge turns the graph into confident fiction.
  origin text not null default 'user' check (origin in ('user', 'ai', 'import')),

  -- Where the claim came from — { lessonId, atSeconds } for a citation heard
  -- in a shiur, { provider: 'sefaria', ref } for an import, { summaryId } for
  -- an @mention. Free-shaped because each origin proves itself differently.
  evidence jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Idempotency for re-runs. Source extraction over the same lesson, or a
-- re-sync from Sefaria, must converge on the same graph rather than stacking
-- duplicate edges every time it runs.
create unique index if not exists kg_edges_unique_idx
  on kg_edges(user_id, from_type, from_id, relation, to_type, to_id);

-- Traversal happens in both directions — "what does this book cite" and
-- "who cites this book" are both first-class questions — so both endpoints
-- are indexed. Without the reverse index, back-links degrade to a seq scan
-- once the graph is more than a few hundred edges.
create index if not exists kg_edges_from_idx on kg_edges(user_id, from_type, from_id);
create index if not exists kg_edges_to_idx on kg_edges(user_id, to_type, to_id);
create index if not exists kg_edges_relation_idx on kg_edges(user_id, relation);

alter table kg_edges enable row level security;

create trigger kg_edges_set_updated_at
  before update on kg_edges
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- books — enrichment for the smart hub.
--
-- Added columns only; nothing existing is renamed or dropped, so every
-- current reader (BookCard, EditBookModal, toBook, the store) keeps working
-- untouched against title/author/category/notes.
-- ----------------------------------------------------------------------------
alter table books add column if not exists cover_image_url text;
alter table books add column if not exists hebrew_title text;
alter table books add column if not exists published_year integer;
alter table books add column if not exists description text;

-- "Important things to know before learning this" — kept separate from
-- `description` because it is advice, not a blurb, and the UI shows them in
-- different places.
alter table books add column if not exists pre_study_notes text;

-- The rabbi row this book is authored by, when the author has been promoted
-- into a full Rabbi entity. Deliberately alongside the existing free-text
-- `author`, not replacing it: a book can be added with just a typed author
-- name long before anyone opens that rabbi's page.
--
-- ON DELETE SET NULL, never CASCADE — deleting a rabbi must not delete the
-- user's books.
alter table books add column if not exists author_rabbi_id uuid
  references rabbis(id) on delete set null;

-- Provider payloads, keyed by provider: { sefaria: {...}, googleBooks: {...} }.
-- One jsonb rather than a column per provider, because adding a third source
-- must not be a migration.
alter table books add column if not exists external_refs jsonb not null default '{}'::jsonb;

-- Commerce and social-proof fields the hub displays. Nullable throughout: a
-- sefer with no listing anywhere is normal, and a 0 would be a lie.
alter table books add column if not exists avg_price_ils numeric(10, 2);
alter table books add column if not exists rating numeric(3, 2) check (rating is null or (rating >= 0 and rating <= 5));
alter table books add column if not exists ratings_count integer;

-- When provider data was last refreshed, so a stale hub can be re-synced
-- without re-fetching everything on every page view.
alter table books add column if not exists last_synced_at timestamptz;

create index if not exists books_author_rabbi_idx on books(user_id, author_rabbi_id);

-- ----------------------------------------------------------------------------
-- rabbis — enrichment for the author ecosystem.
--
-- Teachers and students are NOT columns here. They are kg_edges rows with
-- relation='taught_by', because that is the relationship the app has to walk
-- recursively (a chain of transmission), and a self-referencing FK can only
-- express one step of it per row without a join table — which is what
-- kg_edges already is.
-- ----------------------------------------------------------------------------
alter table rabbis add column if not exists hebrew_name text;
alter table rabbis add column if not exists portrait_url text;
alter table rabbis add column if not exists birth_year integer;
alter table rabbis add column if not exists death_year integer;
alter table rabbis add column if not exists birth_place text;
alter table rabbis add column if not exists death_place text;

-- Where they lived, in order: [{ place, fromYear, toYear, note }]. An array
-- because the timeline biography renders movement, not a single address.
alter table rabbis add column if not exists locations jsonb not null default '[]'::jsonb;

-- "ראשונים" / "אחרונים" / "תנאים" … — a label, not an enum, because the
-- periodisation people actually use is contested and regional.
alter table rabbis add column if not exists era text;
alter table rabbis add column if not exists bio text;
alter table rabbis add column if not exists external_refs jsonb not null default '{}'::jsonb;
alter table rabbis add column if not exists last_synced_at timestamptz;

-- ----------------------------------------------------------------------------
-- concepts — the global glossary ("השגחה פרטית" and friends).
--
-- A concept is a first-class row rather than a tag string because it
-- accumulates its own content: a definition, aliases, and every place it was
-- ever mentioned. A jsonb tag on each summary could never answer "show me
-- everywhere I have written about this".
-- ----------------------------------------------------------------------------
create table if not exists concepts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,

  -- As the user (or the model) writes it, preserved for display.
  term text not null,

  -- Case/nikud/geresh-folded form used for matching and uniqueness. Computed
  -- in lib/torah/normalizeTerm.ts and written by the caller rather than by a
  -- generated column, so the folding rules can change without a migration
  -- that rewrites the table.
  normalized_term text not null,

  -- Other surface forms that mean the same thing, so "השגחה פרטית" and
  -- "השג״פ" collapse to one page.
  aliases jsonb not null default '[]'::jsonb,

  definition text,

  -- Whether the definition above was written by the user or generated. The
  -- glossary shows generated text differently — it is a starting point, not
  -- the user's own learning.
  definition_origin text not null default 'ai' check (definition_origin in ('user', 'ai')),

  -- Denormalised counter, maintained by the mention writer. Every glossary
  -- listing sorts by it, and counting concept_mentions per row on each render
  -- is the one query that would actually get slow here.
  mention_count integer not null default 0,

  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per distinct term per user. The glossary's entire premise is that
-- repeated mentions converge on a single page.
create unique index if not exists concepts_user_term_idx on concepts(user_id, normalized_term);
create index if not exists concepts_user_count_idx on concepts(user_id, mention_count desc);

alter table concepts enable row level security;

create trigger concepts_set_updated_at
  before update on concepts
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- concept_mentions — every place a concept appears.
-- ----------------------------------------------------------------------------
create table if not exists concept_mentions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  concept_id uuid not null references concepts(id) on delete cascade,

  -- Same polymorphic (type, id) convention as kg_edges, for the same reason.
  source_type text not null check (source_type in ('summary', 'lesson', 'book', 'knowledge_entry')),
  source_id text not null,

  -- The sentence around the mention, so the concept page can show context
  -- without loading and re-scanning every source document.
  excerpt text,

  -- Playback position, when the mention came from timed media.
  at_seconds integer,

  created_at timestamptz not null default now()
);

-- Re-scanning a document must update, not duplicate.
create unique index if not exists concept_mentions_unique_idx
  on concept_mentions(user_id, concept_id, source_type, source_id, coalesce(at_seconds, -1));
create index if not exists concept_mentions_concept_idx on concept_mentions(user_id, concept_id);
create index if not exists concept_mentions_source_idx on concept_mentions(user_id, source_type, source_id);

alter table concept_mentions enable row level security;

-- ----------------------------------------------------------------------------
-- kg_walk — recursive traversal, in the database.
--
-- This is the function that makes "handle complex recursive relationships" a
-- property of the schema rather than a promise. Chains of transmission
-- (taught_by → taught_by → …) and citation trees (quotes → quotes → …) are
-- unbounded in principle, and pulling every edge into Node just to walk them
-- would move the whole graph over the wire for a question about one branch.
--
-- Cycle safety is not optional here. Real data contains them: two rabbis
-- each recorded as the other's teacher, a book that cites a commentary that
-- cites it back. The `path` array carries the visited set, and the WHERE
-- clause refuses to re-enter a node already on the path — so a cycle
-- terminates that branch instead of recursing until the connection dies.
--
-- SECURITY: p_user_id is a parameter, and every row touched is filtered by
-- it at both levels of the recursion. The function is not SECURITY DEFINER —
-- it runs as the caller (the service role), exactly like the equivalent
-- hand-written query in lib/db would.
-- ----------------------------------------------------------------------------
create or replace function kg_walk(
  p_user_id uuid,
  p_start_type text,
  p_start_id text,
  p_relations text[],
  p_max_depth integer default 4
)
returns table (
  node_type text,
  node_id text,
  relation text,
  depth integer,
  weight real,
  origin text,
  path text[]
)
language sql
stable
as $$
  with recursive walk as (
    -- Seed: the starting node itself, at depth 0.
    select
      p_start_type as node_type,
      p_start_id   as node_id,
      null::text   as relation,
      0            as depth,
      1::real      as weight,
      'user'::text as origin,
      array[p_start_type || ':' || p_start_id] as path

    union all

    select
      e.to_type,
      e.to_id,
      e.relation,
      w.depth + 1,
      e.weight,
      e.origin,
      w.path || (e.to_type || ':' || e.to_id)
    from walk w
    join kg_edges e
      on e.user_id = p_user_id
     and e.from_type = w.node_type
     and e.from_id = w.node_id
     and (p_relations is null or e.relation = any(p_relations))
    where w.depth < p_max_depth
      -- The cycle guard. Without it this recurses forever on real data.
      and not ((e.to_type || ':' || e.to_id) = any(w.path))
  )
  select node_type, node_id, relation, depth, weight, origin, path
  from walk
  where depth > 0;
$$;
