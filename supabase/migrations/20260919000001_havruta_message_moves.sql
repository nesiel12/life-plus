-- ============================================================================
-- havruta_messages.moves — what an assistant turn was doing.
--
-- ["kushya", "shita"] — a challenge, an opposing view, support, a clarifying
-- question, a resolution (lib/torah/havruta.ts HavrutaMove). Rendered as
-- badges, so the learner sees at a glance whether they were just challenged
-- or backed up. Stored per turn: reloading a thread must not lose them.
-- ============================================================================

alter table havruta_messages add column if not exists moves jsonb not null default '[]'::jsonb;
