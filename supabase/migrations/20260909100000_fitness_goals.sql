-- Personal Fitness & Body Goals ("מטרות כושר וגוף") — the Health module's
-- goal-setting section.
--
-- One row per user (like personal_dna): a person has one set of active body
-- targets, not a list. Every target is nullable — a user who only cares about
-- workout frequency sets that and nothing else, and an unset target is "not
-- tracking this", never zero.
--
-- The "current" side of each progress bar is computed, not stored: workout
-- frequency counts this week's rows in `workouts`, calories/protein sum
-- today's `meals` macros. Only weight needs its own logged value, because
-- nothing else in the app knows it.

create table fitness_goals (
  user_id uuid primary key references users(id) on delete cascade,

  -- Weight, in kilograms. start_weight_kg is the baseline the progress bar
  -- measures from; current_weight_kg is the latest the user entered.
  start_weight_kg   numeric(5, 1) check (start_weight_kg   is null or start_weight_kg   between 20 and 400),
  current_weight_kg numeric(5, 1) check (current_weight_kg is null or current_weight_kg between 20 and 400),
  target_weight_kg  numeric(5, 1) check (target_weight_kg  is null or target_weight_kg  between 20 and 400),

  -- Free text: "לעלות 4 ק""ג מסת שריר", "להוריד אחוז שומן ל-15%".
  body_composition_goal text check (body_composition_goal is null or char_length(body_composition_goal) <= 400),

  -- Workouts per week.
  weekly_workout_target smallint check (weekly_workout_target is null or weekly_workout_target between 1 and 21),

  -- Daily nutrition targets.
  daily_calorie_target smallint check (daily_calorie_target is null or daily_calorie_target between 500 and 10000),
  daily_protein_target smallint check (daily_protein_target is null or daily_protein_target between 10 and 500),

  updated_at timestamptz not null default now()
);

alter table fitness_goals enable row level security;

create trigger fitness_goals_set_updated_at
  before update on fitness_goals
  for each row execute function set_updated_at();
