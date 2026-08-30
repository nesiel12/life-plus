-- Live schema dump from https://mvlsahvtmdgidodgwkso.supabase.co
-- Generated 2026-08-30T21:37:12.538Z
-- 35 tables

-- ================= books =================
create table books (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  author text,
  category text,
  notes text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint books_pkey PRIMARY KEY (id),
  constraint books_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX books_user_id_idx ON public.books USING btree (user_id);

-- ================= certifications =================
create table certifications (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  course_id uuid not null,
  score integer not null,
  awarded_at timestamp with time zone not null default now(),
  constraint certifications_pkey PRIMARY KEY (id),
  constraint certifications_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  constraint certifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  constraint certifications_user_id_course_id_key UNIQUE (user_id, course_id)
);
CREATE UNIQUE INDEX certifications_user_id_course_id_key ON public.certifications USING btree (user_id, course_id);
CREATE INDEX certifications_user_id_idx ON public.certifications USING btree (user_id);

-- ================= chat_messages =================
create table chat_messages (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  role USER-DEFINED not null,
  content text not null,
  created_at timestamp with time zone not null default now(),
  pinned_at timestamp with time zone,
  constraint chat_messages_pkey PRIMARY KEY (id),
  constraint chat_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX chat_messages_user_id_created_at_idx ON public.chat_messages USING btree (user_id, created_at);

-- ================= course_stages =================
create table course_stages (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  course_id uuid not null,
  order_index integer not null default 0,
  kind text not null,
  title text not null,
  markdown_content text,
  checklist_items jsonb not null default '[]'::jsonb,
  videos jsonb not null default '[]'::jsonb,
  quiz_questions jsonb not null default '[]'::jsonb,
  practical_prompt text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint course_stages_pkey PRIMARY KEY (id),
  constraint course_stages_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  constraint course_stages_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  constraint course_stages_kind_check CHECK ((kind = ANY (ARRAY['prerequisites'::text, 'lesson'::text, 'exam'::text])))
);
CREATE INDEX course_stages_user_id_idx ON public.course_stages USING btree (user_id);
CREATE INDEX course_stages_course_id_idx ON public.course_stages USING btree (course_id);

-- ================= courses =================
create table courses (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  description text,
  category text,
  level text not null default 'beginner'::text,
  status text not null default 'not_started'::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint courses_pkey PRIMARY KEY (id),
  constraint courses_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  constraint courses_level_check CHECK ((level = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text]))),
  constraint courses_status_check CHECK ((status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'completed'::text])))
);
CREATE INDEX courses_user_id_idx ON public.courses USING btree (user_id);

-- ================= daily_intentions =================
create table daily_intentions (
  user_id uuid not null,
  intention_date date not null default CURRENT_DATE,
  intention text not null default ''::text,
  updated_at timestamp with time zone not null default now(),
  constraint daily_intentions_pkey PRIMARY KEY (user_id, intention_date),
  constraint daily_intentions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ================= daily_reflections =================
create table daily_reflections (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  date date not null,
  tefillot_count integer not null,
  learning_minutes integer not null default 0,
  learning_type text not null default 'none'::text,
  diet_quality text not null,
  energy_mood integer not null,
  gratitude_note text,
  score integer not null,
  xp_awarded integer not null,
  created_at timestamp with time zone not null default now(),
  constraint daily_reflections_pkey PRIMARY KEY (id),
  constraint daily_reflections_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  constraint daily_reflections_user_id_date_key UNIQUE (user_id, date),
  constraint daily_reflections_learning_type_check CHECK ((learning_type = ANY (ARRAY['torah'::text, 'professional'::text, 'both'::text, 'none'::text]))),
  constraint daily_reflections_score_check CHECK (((score >= 0) AND (score <= 100))),
  constraint daily_reflections_tefillot_count_check CHECK (((tefillot_count >= 0) AND (tefillot_count <= 3))),
  constraint daily_reflections_diet_quality_check CHECK ((diet_quality = ANY (ARRAY['healthy'::text, 'junk'::text]))),
  constraint daily_reflections_xp_awarded_check CHECK ((xp_awarded >= 0)),
  constraint daily_reflections_energy_mood_check CHECK (((energy_mood >= 1) AND (energy_mood <= 10))),
  constraint daily_reflections_learning_minutes_check CHECK ((learning_minutes >= 0))
);
CREATE UNIQUE INDEX daily_reflections_user_id_date_key ON public.daily_reflections USING btree (user_id, date);
CREATE INDEX daily_reflections_user_id_idx ON public.daily_reflections USING btree (user_id);
CREATE INDEX daily_reflections_user_date_idx ON public.daily_reflections USING btree (user_id, date DESC);

-- ================= energy_logs =================
create table energy_logs (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  logged_at timestamp with time zone not null default now(),
  hour integer not null,
  level text not null,
  note text,
  created_at timestamp with time zone not null default now(),
  constraint energy_logs_pkey PRIMARY KEY (id),
  constraint energy_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  constraint energy_logs_hour_check CHECK (((hour >= 0) AND (hour <= 23))),
  constraint energy_logs_level_check CHECK ((level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])))
);
CREATE INDEX energy_logs_user_id_idx ON public.energy_logs USING btree (user_id);
CREATE INDEX energy_logs_user_logged_idx ON public.energy_logs USING btree (user_id, logged_at);

-- ================= fluid_tasks =================
create table fluid_tasks (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  goal_id uuid,
  title text not null,
  estimated_minutes integer not null,
  energy_requirement text not null default 'medium'::text,
  deadline timestamp with time zone,
  flexibility text not null default 'flexible'::text,
  scheduled_start timestamp with time zone,
  scheduled_end timestamp with time zone,
  is_completed boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint fluid_tasks_pkey PRIMARY KEY (id),
  constraint fluid_tasks_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE SET NULL,
  constraint fluid_tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  constraint fluid_tasks_energy_requirement_check CHECK ((energy_requirement = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))),
  constraint fluid_tasks_estimated_minutes_check CHECK ((estimated_minutes > 0)),
  constraint fluid_tasks_flexibility_check CHECK ((flexibility = ANY (ARRAY['flexible'::text, 'fixed'::text])))
);
CREATE INDEX fluid_tasks_user_id_idx ON public.fluid_tasks USING btree (user_id);
CREATE INDEX fluid_tasks_user_scheduled_idx ON public.fluid_tasks USING btree (user_id, scheduled_start);

-- ================= goals =================
create table goals (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  category USER-DEFINED not null,
  target_date date,
  created_at timestamp with time zone not null default now(),
  person_id uuid,
  constraint goals_pkey PRIMARY KEY (id),
  constraint goals_person_id_fkey FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE SET NULL,
  constraint goals_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX goals_user_id_idx ON public.goals USING btree (user_id);
CREATE INDEX goals_person_id_idx ON public.goals USING btree (person_id);

-- ================= habit_logs =================
create table habit_logs (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  habit_id uuid not null,
  completed_date date not null,
  created_at timestamp with time zone not null default now(),
  constraint habit_logs_pkey PRIMARY KEY (id),
  constraint habit_logs_habit_id_fkey FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE,
  constraint habit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  constraint habit_logs_habit_id_completed_date_key UNIQUE (habit_id, completed_date)
);
CREATE UNIQUE INDEX habit_logs_habit_id_completed_date_key ON public.habit_logs USING btree (habit_id, completed_date);
CREATE INDEX habit_logs_user_id_idx ON public.habit_logs USING btree (user_id);
CREATE INDEX habit_logs_user_id_date_idx ON public.habit_logs USING btree (user_id, completed_date);

-- ================= habits =================
create table habits (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint habits_pkey PRIMARY KEY (id),
  constraint habits_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX habits_user_id_idx ON public.habits USING btree (user_id);

-- ================= health_logs =================
create table health_logs (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  log_date date not null default CURRENT_DATE,
  sleep_hours numeric,
  mood_score smallint,
  hydration_ml integer,
  workout_minutes integer,
  workout_type text,
  notes text,
  created_at timestamp with time zone not null default now(),
  constraint health_logs_pkey PRIMARY KEY (id),
  constraint health_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  constraint health_logs_user_id_log_date_key UNIQUE (user_id, log_date),
  constraint health_logs_mood_score_check CHECK (((mood_score >= 1) AND (mood_score <= 5)))
);
CREATE UNIQUE INDEX health_logs_user_id_log_date_key ON public.health_logs USING btree (user_id, log_date);
CREATE INDEX health_logs_user_id_date_idx ON public.health_logs USING btree (user_id, log_date DESC);

-- ================= insights =================
create table insights (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  content text not null,
  created_at timestamp with time zone not null default now(),
  constraint insights_pkey PRIMARY KEY (id),
  constraint insights_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX insights_user_id_created_at_idx ON public.insights USING btree (user_id, created_at DESC);

-- ================= knowledge_entries =================
create table knowledge_entries (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  entry_date date not null default CURRENT_DATE,
  topic text not null,
  source text not null,
  summary text not null,
  duration_minutes smallint,
  created_at timestamp with time zone not null default now(),
  last_reviewed_at timestamp with time zone,
  flashcards jsonb,
  review_questions jsonb,
  constraint knowledge_entries_pkey PRIMARY KEY (id),
  constraint knowledge_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX knowledge_entries_user_id_date_idx ON public.knowledge_entries USING btree (user_id, entry_date DESC);

-- ================= learning_resources =================
create table learning_resources (
  id uuid not null default gen_random_uuid(),
  user_id text not null,
  title text not null,
  url text,
  type text,
  status text default 'to_read'::text,
  created_at timestamp with time zone default now(),
  constraint learning_resources_pkey PRIMARY KEY (id)
);

-- ================= learning_topics =================
create table learning_topics (
  id uuid not null default gen_random_uuid(),
  user_id text not null,
  title text not null,
  description text,
  status text default 'active'::text,
  created_at timestamp with time zone default now(),
  constraint learning_topics_pkey PRIMARY KEY (id)
);

-- ================= life_area_scores =================
create table life_area_scores (
  user_id uuid not null,
  area_key USER-DEFINED not null,
  score smallint not null default 50,
  last_touched date,
  updated_at timestamp with time zone not null default now(),
  constraint life_area_scores_pkey PRIMARY KEY (user_id, area_key),
  constraint life_area_scores_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  constraint life_area_scores_score_check CHECK (((score >= 0) AND (score <= 100)))
);

-- ================= manual_events =================
create table manual_events (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  start_time timestamp with time zone not null,
  end_time timestamp with time zone not null,
  category USER-DEFINED,
  reminder_minutes integer,
  linked_contact_ids ARRAY not null default '{}'::uuid[],
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint manual_events_pkey PRIMARY KEY (id),
  constraint manual_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  constraint manual_events_check CHECK ((end_time > start_time)),
  constraint manual_events_reminder_minutes_check CHECK (((reminder_minutes IS NULL) OR (reminder_minutes > 0)))
);
CREATE INDEX manual_events_user_id_idx ON public.manual_events USING btree (user_id);
CREATE INDEX manual_events_user_id_start_idx ON public.manual_events USING btree (user_id, start_time);

-- ================= meals =================
create table meals (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  description text not null,
  eaten_at timestamp with time zone not null default now(),
  type text not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint meals_pkey PRIMARY KEY (id),
  constraint meals_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  constraint meals_type_check CHECK ((type = ANY (ARRAY['breakfast'::text, 'lunch'::text, 'dinner'::text, 'snack'::text, 'post-workout'::text])))
);
CREATE INDEX meals_user_id_idx ON public.meals USING btree (user_id);
CREATE INDEX meals_user_id_eaten_at_idx ON public.meals USING btree (user_id, eaten_at DESC);

-- ================= milestones =================
create table milestones (
  id uuid not null default gen_random_uuid(),
  goal_id uuid not null,
  title text not null,
  done boolean not null default false,
  position smallint not null default 0,
  created_at timestamp with time zone not null default now(),
  completed_at timestamp with time zone,
  due_date date,
  constraint milestones_pkey PRIMARY KEY (id),
  constraint milestones_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
);
CREATE INDEX milestones_goal_id_idx ON public.milestones USING btree (goal_id);

-- ================= moments =================
create table moments (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  category USER-DEFINED not null,
  title text not null,
  content text not null,
  occurred_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  person_id uuid,
  constraint moments_pkey PRIMARY KEY (id),
  constraint moments_person_id_fkey FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE SET NULL,
  constraint moments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX moments_user_id_occurred_at_idx ON public.moments USING btree (user_id, occurred_at DESC);
CREATE INDEX moments_person_id_idx ON public.moments USING btree (person_id) WHERE (person_id IS NOT NULL);

-- ================= people =================
create table people (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  hebrew_name text,
  relation text not null,
  last_meaningful_interaction timestamp with time zone,
  birthday text,
  note text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  anniversary text,
  phone text,
  avatar_url text,
  constraint people_pkey PRIMARY KEY (id),
  constraint people_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  constraint people_anniversary_check CHECK ((anniversary ~ '^\d{2}-\d{2}$'::text)),
  constraint people_birthday_check CHECK ((birthday ~ '^\d{2}-\d{2}$'::text))
);
CREATE INDEX people_user_id_idx ON public.people USING btree (user_id);

-- ================= personal_dna =================
create table personal_dna (
  user_id uuid not null,
  peak_focus_hours text,
  learning_style text,
  family_check_in_interval_days smallint,
  habit_notes ARRAY not null default '{}'::text[],
  onboarding_complete boolean not null default false,
  updated_at timestamp with time zone not null default now(),
  sleep_notes text,
  career_notes text,
  motivation_triggers ARRAY not null default '{}'::text[],
  constraint personal_dna_pkey PRIMARY KEY (user_id),
  constraint personal_dna_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ================= personal_patterns =================
create table personal_patterns (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  category text not null,
  pattern_type text not null,
  subject text not null default ''::text,
  description text not null,
  value text not null,
  confidence numeric not null,
  evidence_count integer not null default 0,
  source text not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint personal_patterns_pkey PRIMARY KEY (id),
  constraint personal_patterns_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  constraint personal_patterns_user_id_category_pattern_type_subject_key UNIQUE (user_id, category, pattern_type, subject),
  constraint personal_patterns_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
  constraint personal_patterns_evidence_count_check CHECK ((evidence_count >= 0))
);
CREATE UNIQUE INDEX personal_patterns_user_id_category_pattern_type_subject_key ON public.personal_patterns USING btree (user_id, category, pattern_type, subject);
CREATE INDEX personal_patterns_user_id_confidence_idx ON public.personal_patterns USING btree (user_id, confidence DESC);

-- ================= rabbis =================
create table rabbis (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  title text,
  notes text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint rabbis_pkey PRIMARY KEY (id),
  constraint rabbis_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX rabbis_user_id_idx ON public.rabbis USING btree (user_id);

-- ================= recommendation_events =================
create table recommendation_events (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  type text not null,
  source text not null,
  recommendation_payload jsonb not null default '{}'::jsonb,
  status USER-DEFINED not null default 'pending'::recommendation_status,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  responded_at timestamp with time zone,
  constraint recommendation_events_pkey PRIMARY KEY (id),
  constraint recommendation_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX recommendation_events_user_id_created_at_idx ON public.recommendation_events USING btree (user_id, created_at DESC);
CREATE INDEX recommendation_events_user_id_type_idx ON public.recommendation_events USING btree (user_id, type);

-- ================= smart_events =================
create table smart_events (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  start_time timestamp with time zone not null,
  end_time timestamp with time zone not null,
  location text,
  is_overrun boolean not null default false,
  actual_end_time timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint smart_events_pkey PRIMARY KEY (id),
  constraint smart_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  constraint smart_events_check CHECK ((end_time > start_time))
);
CREATE INDEX smart_events_user_id_idx ON public.smart_events USING btree (user_id);
CREATE INDEX smart_events_user_start_idx ON public.smart_events USING btree (user_id, start_time);

-- ================= stage_progress =================
create table stage_progress (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  stage_id uuid not null,
  completed_at timestamp with time zone not null default now(),
  constraint stage_progress_pkey PRIMARY KEY (id),
  constraint stage_progress_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES course_stages(id) ON DELETE CASCADE,
  constraint stage_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  constraint stage_progress_user_id_stage_id_key UNIQUE (user_id, stage_id)
);
CREATE UNIQUE INDEX stage_progress_user_id_stage_id_key ON public.stage_progress USING btree (user_id, stage_id);
CREATE INDEX stage_progress_user_id_idx ON public.stage_progress USING btree (user_id);
CREATE INDEX stage_progress_stage_id_idx ON public.stage_progress USING btree (stage_id);

-- ================= summaries =================
create table summaries (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  content text not null,
  summary_date date not null default CURRENT_DATE,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint summaries_pkey PRIMARY KEY (id),
  constraint summaries_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX summaries_user_id_date_idx ON public.summaries USING btree (user_id, summary_date DESC);

-- ================= tasks =================
create table tasks (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  description text,
  status text not null default 'todo'::text,
  due_date timestamp with time zone,
  is_high_priority boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint tasks_pkey PRIMARY KEY (id),
  constraint tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  constraint tasks_status_check CHECK ((status = ANY (ARRAY['todo'::text, 'in-progress'::text, 'done'::text])))
);
CREATE INDEX tasks_user_id_idx ON public.tasks USING btree (user_id);
CREATE INDEX tasks_user_id_status_idx ON public.tasks USING btree (user_id, status);

-- ================= transactions =================
create table transactions (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  amount numeric not null,
  type text not null,
  category text not null,
  transaction_date date not null default CURRENT_DATE,
  note text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  title text not null,
  is_shift boolean not null default false,
  hourly_rate numeric,
  shift_start timestamp with time zone,
  shift_end timestamp with time zone,
  employer text,
  is_recurring boolean not null default false,
  constraint transactions_pkey PRIMARY KEY (id),
  constraint transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  constraint transactions_amount_check CHECK ((amount > (0)::numeric)),
  constraint transactions_shift_times_check CHECK (((shift_end IS NULL) OR (shift_start IS NULL) OR (shift_end > shift_start))),
  constraint transactions_type_check CHECK ((type = ANY (ARRAY['income'::text, 'expense'::text])))
);
CREATE INDEX transactions_user_id_idx ON public.transactions USING btree (user_id);
CREATE INDEX transactions_user_id_date_idx ON public.transactions USING btree (user_id, transaction_date DESC);

-- ================= upcoming_events =================
create table upcoming_events (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  category USER-DEFINED not null,
  event_date date not null,
  created_at timestamp with time zone not null default now(),
  google_event_id text,
  constraint upcoming_events_pkey PRIMARY KEY (id),
  constraint upcoming_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX upcoming_events_user_id_date_idx ON public.upcoming_events USING btree (user_id, event_date);

-- ================= users =================
create table users (
  id uuid not null default gen_random_uuid(),
  email text not null,
  name text not null,
  hebrew_name text,
  life_stage text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint users_pkey PRIMARY KEY (id),
  constraint users_email_key UNIQUE (email)
);
CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);

-- ================= workouts =================
create table workouts (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  start_time timestamp with time zone not null default now(),
  end_time timestamp with time zone,
  routine_details text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint workouts_pkey PRIMARY KEY (id),
  constraint workouts_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  constraint workouts_check CHECK (((end_time IS NULL) OR (end_time > start_time)))
);
CREATE INDEX workouts_user_id_idx ON public.workouts USING btree (user_id);
CREATE INDEX workouts_user_id_start_time_idx ON public.workouts USING btree (user_id, start_time DESC);

