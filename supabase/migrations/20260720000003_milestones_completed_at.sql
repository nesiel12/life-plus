-- Personal DNA v1's goal-behavior analyzer needs to know *when* a milestone
-- was completed (not just that it currently is) to compute completion pace
-- and momentum signals — see docs/ATLAS_ARCHITECTURE_VISION.md §3.
--
-- Deliberately left NULL for milestones already marked done before this
-- migration — we genuinely don't know when those were completed, and
-- backfilling with a guessed timestamp (e.g. created_at) would be inventing
-- data the analyzer would then treat as real evidence. It populates
-- correctly going forward via lib/db/goals.ts's toggleMilestone.

alter table milestones add column completed_at timestamptz;
