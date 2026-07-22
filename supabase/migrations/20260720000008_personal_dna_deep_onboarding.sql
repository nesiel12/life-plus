-- Deep Onboarding & Personal DNA Engine milestone (docs/ATLAS_ARCHITECTURE_
-- VISION.md §3/§12): the conversational onboarding covers career and sleep
-- alongside the fields personal_dna already tracked (peak_focus_hours,
-- learning_style, habit_notes), plus motivation_triggers as its own
-- accumulating list rather than folding into habit_notes, which already
-- means something more specific ("things you do") than "what motivates
-- you." All nullable/defaulted — existing rows need no backfill.

alter table personal_dna
  add column sleep_notes text,
  add column career_notes text,
  add column motivation_triggers text[] not null default '{}';
