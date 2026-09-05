-- Unified summary architecture: user-defined top-level sections, and
-- ordering within them.
--
-- Sections are rows, not an enum. The whole point is that the user invents
-- their own ("פרשת שבוע", "דברי תורה", whatever their learning actually
-- looks like), so a fixed set in the type system would defeat the feature
-- and require a migration per new category.

create table if not exists summary_sections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  -- A lucide icon name, chosen from a closed list in the UI. Nullable so a
  -- section without one still renders.
  icon text,
  -- Sparse integers, deliberately: reordering rewrites only the moved row's
  -- neighbours rather than renumbering the whole list, and leaves room to
  -- insert between two rows without touching either.
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists summary_sections_user_order_idx
  on summary_sections(user_id, sort_order);

alter table summary_sections enable row level security;

create trigger summary_sections_set_updated_at
  before update on summary_sections
  for each row execute function set_updated_at();

-- Which section a summary belongs to, and where it sits inside it.
--
-- ON DELETE SET NULL rather than CASCADE: deleting a section must never
-- delete the user's writing. An unassigned summary falls back to the
-- "all summaries" view, which is recoverable; a cascade would silently
-- destroy work.
alter table summaries add column if not exists section_id uuid
  references summary_sections(id) on delete set null;

alter table summaries add column if not exists sort_order integer not null default 0;

-- Free-text tags, for the "tag entries" requirement. jsonb array of strings
-- rather than a join table: tags here are labels the user types, never
-- entities with their own identity or behaviour, and a join table would add
-- two queries to every read for no gain.
alter table summaries add column if not exists tags jsonb not null default '[]'::jsonb;

create index if not exists summaries_section_order_idx
  on summaries(user_id, section_id, sort_order);
