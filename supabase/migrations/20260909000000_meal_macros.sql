-- Health & Fitness Space: macros on a logged meal.
--
-- The Vision Food Tracker photographs a plate (or the user types "2 eggs and
-- toast"), and the model estimates calories + the three macros. Stored as
-- nullable numerics: a meal logged the old way (just a description) has none,
-- and that is a valid state, not a zero.

alter table meals
  add column calories numeric(7, 1) check (calories is null or calories >= 0),
  add column protein_g numeric(6, 1) check (protein_g is null or protein_g >= 0),
  add column carbs_g   numeric(6, 1) check (carbs_g   is null or carbs_g   >= 0),
  add column fats_g     numeric(6, 1) check (fats_g     is null or fats_g     >= 0);
