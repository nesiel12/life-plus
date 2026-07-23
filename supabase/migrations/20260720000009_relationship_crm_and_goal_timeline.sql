-- Relationship CRM + Goals Engine timeline (docs/ATLAS_ARCHITECTURE_VISION.md
-- §13): three small, additive columns for two related capabilities.
--
-- people.anniversary mirrors people.birthday exactly (same "MM-DD" shape,
-- same constraint) — an anniversary is the same annual-recurrence question
-- birthdays already answer, not a new kind of date.
--
-- goals.person_id links a goal to the person it's about (a "relationship
-- goal" — e.g. planning a wedding with a specific partner), nullable
-- because most goals aren't about a specific person. on delete set null,
-- not cascade: removing a person shouldn't destroy a goal that still
-- exists independently of them.
--
-- milestones.due_date is the Goals Engine's real "timeline" — a target
-- date on the goal (goals.target_date, already existed) now gets spread
-- across its milestones (lib/goals/distributeMilestoneDates.ts) instead of
-- leaving them as an unordered, undated checklist.

alter table people
  add column anniversary text check (anniversary ~ '^\d{2}-\d{2}$');

alter table goals
  add column person_id uuid references people(id) on delete set null;

create index goals_person_id_idx on goals(person_id);

alter table milestones
  add column due_date date;
