-- Personal DNA Engine v1 (docs/ATLAS_ARCHITECTURE_VISION.md §3) — durable
-- storage for patterns discovered by deterministic analysis of the user's
-- own data (lib/intelligence/personalDNA/). Each row answers two questions:
-- "what do we believe about the user" (description/value) and "why do we
-- believe it" (confidence/evidence_count/source).
--
-- `subject` disambiguates multiple patterns of the same pattern_type per
-- user (e.g. a peakActivityWindow pattern per life-area category) — never
-- null (Postgres treats NULL as distinct on every row for uniqueness
-- purposes, which would defeat the upsert-by-conflict-target this table is
-- built around), empty string when not applicable.

create table personal_patterns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  category text not null,
  pattern_type text not null,
  subject text not null default '',
  description text not null,
  value text not null,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  source text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category, pattern_type, subject)
);

create index personal_patterns_user_id_confidence_idx on personal_patterns(user_id, confidence desc);

alter table personal_patterns enable row level security;

create trigger personal_patterns_set_updated_at
  before update on personal_patterns
  for each row execute function set_updated_at();
