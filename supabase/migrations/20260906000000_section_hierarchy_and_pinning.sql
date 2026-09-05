-- Torah Space: sub-sections, and pinning for both sections and study items.
--
-- THREE COLUMNS, THREE DECISIONS.
--
-- 1. summary_sections.parent_id — one level of sub-sections.
--
-- The requirement is "sub-topics and hierarchical organization within custom
-- sections", e.g. grouping a Parasha section by parasha, or Halacha by
-- ruling. The alternative was a plain `subtopic text` label on each summary,
-- which is less code and genuinely less capable: a label cannot be
-- reordered, renamed in one place, pinned, or have its own items counted.
--
-- Depth is capped at one, enforced in the application (lib/summaries/
-- hierarchy.ts) rather than by a constraint, because SQL cannot express
-- "parent_id must reference a row whose own parent_id is null" without a
-- trigger. The cap is not squeamishness about recursion: these sections are
-- rendered as a *tab bar*, and arbitrary nesting turns a tab bar into a tree
-- widget — a different component with different navigation, which is not
-- what was asked for.
--
-- ON DELETE SET NULL, matching summaries.section_id: deleting a parent
-- promotes its children to top level rather than destroying them and the
-- writing filed under them. Cascade here would delete a user's notes two
-- hops away from the button they pressed.
alter table summary_sections add column if not exists parent_id uuid
  references summary_sections(id) on delete set null;

create index if not exists summary_sections_parent_idx
  on summary_sections(user_id, parent_id, sort_order);

-- 2. Pinning, as a timestamp rather than a boolean.
--
-- `pinned_at` costs the same as `is_pinned` and answers one more question:
-- the order pins go in. With a boolean, several pinned items fall back to
-- their ordinary sort order, so pinning a third item can silently drop it
-- below two things pinned long ago. Most-recently-pinned-first is what
-- people expect, and only a timestamp can express it.
alter table summary_sections add column if not exists pinned_at timestamptz;
alter table summaries add column if not exists pinned_at timestamptz;

-- Partial indexes: the overwhelming majority of rows are unpinned, and the
-- only query that touches this column asks for the pinned ones.
create index if not exists summary_sections_pinned_idx
  on summary_sections(user_id, pinned_at desc) where pinned_at is not null;

create index if not exists summaries_pinned_idx
  on summaries(user_id, section_id, pinned_at desc) where pinned_at is not null;
