-- Personal DNA & Dynamic Onboarding module.
--
-- Extends the existing personal_dna table rather than adding a parallel
-- user_dna one. personal_dna is already the single source of truth for
-- onboarding-collected traits: lib/intelligence/personalDNA/* analyses it,
-- lib/intelligence/core/normalize.ts turns it into ranked AI signals,
-- buildSystemPrompt injects it into every chat, and onboarding_complete on
-- this row is what gates the onboarding modal in AppShell. A second table
-- would fork all of that.
--
-- Two fields from the module spec are deliberately NOT stored here as jsonb:
--
--   important_people -> the people table already models contacts with
--     birthday and anniversary, and the Relationship CRM, the calendar's
--     upcoming-moments feed and goals.person_id all join against it. Burying
--     the same contacts in a jsonb blob would make them invisible to every
--     one of those features.
--   life_goals -> the goals/milestones tables already are the Goals Engine,
--     with per-goal milestones, target dates and life-area categories that
--     the dashboard, the estimator and the next-action recommender read.
--
-- The wizard therefore writes those two steps through the existing relational
-- paths (peopleRepo / goalsRepo) and keeps only genuinely DNA-shaped state
-- here. See app/actions/onboarding.ts.
--
-- Access model: unchanged from the header of 20260720000000_init.sql.
-- Identity is NextAuth (Google OAuth), not Supabase Auth, so user_id
-- references users(id) — auth.users is never populated by this app and
-- auth.uid() is always NULL on the server-side service-role connection that
-- every query uses. RLS stays enabled with no policies: fail-closed for any
-- non-service-role key, with explicit user_id filtering in lib/db/* remaining
-- the real tenant-isolation boundary. Adding auth.uid() policies here would
-- read as protection while enforcing nothing.

alter table personal_dna
  -- Identity. Distinct from users.name, which is whatever Google returned:
  -- this is the name the person chose to be called by, collected in step 1.
  add column full_name text,
  add column birth_date date,

  -- Chronotype (step 2). One object rather than four columns because it is
  -- always read and written as a unit, and the day-part vocabulary is app
  -- config (lib/onboarding/chronotype.ts), not a database concern:
  --   { wakeTime: "06:30", sleepTime: "23:00",
  --     peakFocusHours: ["morning"], lowEnergyHours: ["afternoon"] }
  add column chronotype_settings jsonb not null default '{}'::jsonb,

  -- Ranked life-area keys, most important first (step 1) — e.g.
  -- ["faith","family","career","health","knowledge"]. Values are the
  -- life_area_key vocabulary so a priority can be joined to goals.category
  -- and life_area_scores.area_key.
  add column core_priorities jsonb not null default '[]'::jsonb,

  -- personal_dna predates the created_at convention used by later tables; it
  -- only ever had updated_at. Existing rows get the migration timestamp,
  -- which is the honest answer for "we don't know when this was first
  -- written" without inventing a per-row date.
  add column created_at timestamptz not null default now();

-- Guard the shapes the application relies on. jsonb is schemaless, so without
-- these a bad write surfaces as a confusing runtime error in the AI pipeline
-- instead of a rejected insert.
alter table personal_dna
  add constraint personal_dna_chronotype_is_object
    check (jsonb_typeof(chronotype_settings) = 'object'),
  add constraint personal_dna_core_priorities_is_array
    check (jsonb_typeof(core_priorities) = 'array');

comment on column personal_dna.chronotype_settings is
  'Sleep/wake times and day-part energy windows. See ChronotypeSettings in types/index.ts.';
comment on column personal_dna.core_priorities is
  'Ranked life_area_key values, most important first.';
