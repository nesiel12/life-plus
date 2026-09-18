-- ============================================================================
-- מרחב תורה — Phase 4: AI חברותא, contradiction scanning, Shabbat sheet.
--
-- Additive only. The Havruta and contradiction tables shipped empty in
-- 20260916000002; this fills the gaps the real feature found:
--
--   1. A Havruta can be opened on a rabbi (from the knowledge map's
--      inspector), so `rabbi` joins the subject vocabulary.
--   2. A thread distils into a few Hebrew insights ("מה יצא לנו מהדיון"),
--      which the Shabbat sheet prints. Stored on the thread, because they
--      summarise the thread and die with it.
--   3. A contradiction alert shows the two conflicting lines side by side,
--      so each side keeps the excerpt the model compared — the note itself
--      may be edited later, and the alert must still make sense.
--   4. The scanner remembers which pairs it already judged, keyed by a
--      content fingerprint. Without this every scan re-sends every pair that
--      was fine last time (paying for the same "no conflict" forever), and a
--      pair only re-enters the scan when one of its notes actually changed.
-- ============================================================================

alter table havruta_threads drop constraint if exists havruta_threads_subject_type_check;
alter table havruta_threads add constraint havruta_threads_subject_type_check
  check (subject_type in ('summary', 'lesson', 'book', 'rabbi', 'concept', 'contradiction'));

-- [{ text, kind }] — kind: 'chiddush' | 'kushya' | 'resolution'.
alter table havruta_threads add column if not exists insights jsonb not null default '[]'::jsonb;
alter table havruta_threads add column if not exists insights_at timestamptz;

create index if not exists havruta_threads_recent_idx on havruta_threads(user_id, updated_at desc);

alter table contradiction_alerts add column if not exists left_excerpt text;
alter table contradiction_alerts add column if not exists right_excerpt text;

-- 'halachic' (a practical ruling conflicts) or 'logical' (two claims cannot
-- both be true). Null for alerts written before this migration.
alter table contradiction_alerts add column if not exists kind text
  check (kind is null or kind in ('halachic', 'logical'));

-- How the user settled it, in their own words ("שתי שיטות — המ״ב מחמיר").
alter table contradiction_alerts add column if not exists resolution text;

-- ----------------------------------------------------------------------------
-- contradiction_scan_pairs — the scanner's memory.
-- ----------------------------------------------------------------------------
create table if not exists contradiction_scan_pairs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,

  -- lib/torah/contradictions.ts pairKey(): the normalised "type:id|type:id".
  pair_key text not null,

  -- Hash of both sides' compared text. A changed note changes it, and the
  -- pair is judged again; an unchanged pair is never re-sent.
  fingerprint text not null,

  conflict boolean not null,
  scanned_at timestamptz not null default now()
);

create unique index if not exists contradiction_scan_pairs_key_idx
  on contradiction_scan_pairs(user_id, pair_key);

alter table contradiction_scan_pairs enable row level security;
