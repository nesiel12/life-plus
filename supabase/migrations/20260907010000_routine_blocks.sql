-- The daily schedule skeleton ("לוז").
--
-- The app could already show what is ON a given day (calendar events, tasks,
-- meals, workouts) but had no idea what the day is normally SHAPED like —
-- when this person works, studies, trains, or rests. That is the difference
-- between "you have a meeting at 14:00" and "you are free between 15:00 and
-- 18:00, and you usually train at 18:00".
--
-- Recurring weekly blocks, deliberately NOT rows in manual_events: a
-- timetable is a rule ("Sundays 09:00-13:00"), not thousands of instances,
-- and materialising it as instances makes editing the rule a migration.

create table routine_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,

  title text not null,

  -- Drives colour, the free/busy calculation, and what the Now card says.
  -- 'free' is meaningful and not the same as an absent block: it marks time
  -- the user has deliberately protected, which the app must not fill.
  kind text not null default 'other'
    check (kind in ('work','study','torah','training','rest','meal','commute','family','free','other')),

  -- Sunday = 0, matching Date.getDay() and the Hebrew week the UI renders.
  weekdays smallint[] not null check (
    array_length(weekdays, 1) between 1 and 7
    and weekdays <@ array[0,1,2,3,4,5,6]::smallint[]
  ),

  -- Minutes since local midnight, NOT a timestamp.
  --
  -- A recurring block is a wall-clock rule: "work starts at 09:00" stays
  -- 09:00 across a DST change and across a move to another timezone. Storing
  -- an instant would silently shift the whole timetable by an hour twice a
  -- year. end_minute may be 1440 (midnight) so a block can run to the end of
  -- the day; blocks do not wrap past it.
  start_minute smallint not null check (start_minute >= 0 and start_minute < 1440),
  end_minute smallint not null check (end_minute > 0 and end_minute <= 1440),
  check (end_minute > start_minute),

  note text,

  -- Soft disable, so a block can be switched off for a season (semester
  -- break, injury) without losing it and having to be re-entered.
  is_active boolean not null default true,

  -- Set when the block came from an AI import, so a re-import can tell its
  -- own previous output from blocks the user typed or edited by hand.
  imported_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index routine_blocks_user_idx on routine_blocks (user_id, start_minute);

alter table routine_blocks enable row level security;

-- Reminder lead time for schedule transitions, alongside the notification
-- preferences it belongs with. 0 disables transition alerts entirely.
alter table notification_preferences
  add column schedule_alert_minutes smallint not null default 15
    check (schedule_alert_minutes >= 0 and schedule_alert_minutes <= 120);
