-- Family Experience v2 (docs/ATLAS_ARCHITECTURE_VISION.md §10): a real
-- structural link between moments and the person they're about, replacing
-- the previous convention of just naming the person in a moment's free-text
-- title/content. This is what makes a per-person "relationship timeline"
-- and "interaction history" real (a query, via lib/timeline/
-- buildTimelineEvents.ts on a filtered moment set) instead of a fragile
-- name-matching heuristic.
--
-- Nullable and on delete set null: most moments aren't about a specific
-- person (the vast majority of categories), and deleting a person should
-- never delete the moments logged about them — it should just detach them.

alter table moments add column person_id uuid references people(id) on delete set null;

create index moments_person_id_idx on moments(person_id) where person_id is not null;
