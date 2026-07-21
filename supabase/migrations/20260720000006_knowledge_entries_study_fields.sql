-- Learning Experience v2 (docs/ATLAS_ARCHITECTURE_VISION.md §10): turning a
-- knowledge_entries row from "a logged shiur" into something Atlas can help
-- study from, without inventing a spaced-repetition schema ahead of need.
--
-- last_reviewed_at: null until the user marks an entry reviewed. Needed for
-- an honest "suggested next review" (the entry touched longest ago) instead
-- of conflating "created long ago" with "needs review" — an entry read
-- yesterday shouldn't look overdue just because it was uploaded weeks ago.
-- Never backfilled with a guess, same rule migration 20260720000003 already
-- established for milestones.completed_at.
--
-- flashcards / review_questions: nullable jsonb, populated lazily on first
-- request (app/api/torah/study-material) and cached — regenerating the same
-- study material on every visit would be a real, avoidable AI cost, not a
-- correctness requirement.

alter table knowledge_entries add column last_reviewed_at timestamptz;
alter table knowledge_entries add column flashcards jsonb;
alter table knowledge_entries add column review_questions jsonb;
