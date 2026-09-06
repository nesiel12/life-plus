-- Free-tier AI quota: persistent, per-user, race-proof.
--
-- WHY A TABLE RATHER THAN THE EXISTING IN-MEMORY LIMITER
--
-- lib/api/rateLimit.ts is a per-process Map. On Vercel every instance keeps
-- its own copy, so the effective limit is roughly (configured x instances)
-- and a cold start resets it to zero. That is fine as a cheap first pass
-- against hammering — it stays — but it cannot be the thing standing between
-- an authenticated stranger and the owner's OpenAI bill.
--
-- WHY A FUNCTION RATHER THAN read-then-write IN THE APPLICATION
--
-- The whole problem is concurrency. Any "select count, compare, update"
-- split across two round trips lets N parallel requests all read the same
-- value, all pass the check, and all increment: forty concurrent fetches sail
-- past a forty-per-day limit. PostgREST cannot express a conditional
-- increment, so the check and the increment have to happen inside one
-- transaction in the database. That is what consume_ai_units is for.

-- ============================================================================
-- ai_usage — one row per (user, budget, window).
--
-- Three budgets share the table, distinguished by `scope`:
--   'day'            request units for text generation, resets daily
--   'minute'         request units in the current minute, the burst guard
--   'transcribe_day' audio minutes sent to Whisper, resets daily
--
-- `units` is deliberately not "requests". A Whisper call can cost two
-- hundred times a chat turn, and a course module several times one; counting
-- them all as 1 would price the free tier off the cheapest possible call.
-- The weights live in lib/ai/quota.ts, next to the reasoning.
--
-- window_start is the truncated start of the window (midnight for daily
-- budgets, the top of the minute for the burst budget), which makes the
-- unique index below both the identity and the expiry mechanism: a new window
-- is simply a new row, and old rows age out without any reset job.
-- ============================================================================
create table if not exists ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  scope text not null check (scope in ('day', 'minute', 'transcribe_day')),
  window_start timestamptz not null,
  units integer not null default 0 check (units >= 0),
  updated_at timestamptz not null default now()
);

-- Identity and the conflict target for the upsert inside the function.
create unique index if not exists ai_usage_identity_idx
  on ai_usage(user_id, scope, window_start);

-- Housekeeping: old windows are dead weight, and this is the index a sweep
-- would use. Nothing deletes them yet — a few rows per user per day is
-- cheap, and a cron sweep can be added when it stops being.
create index if not exists ai_usage_window_idx on ai_usage(window_start);

alter table ai_usage enable row level security;

-- RLS enabled with no policies, matching every other table here: the
-- service-role key plus explicit user_id filtering in lib/db is the tenant
-- boundary (see 20260720000000_init.sql's header).

-- ============================================================================
-- consume_ai_units — atomically check every budget, then charge them all.
--
-- Takes a jsonb array of budgets:
--   [{"scope":"day","window":"2026-09-06T00:00:00Z","cost":1,"limit":40}, ...]
--
-- All-or-nothing. If any single budget would be exceeded, nothing is charged
-- and the first offending scope is reported. Charging the daily budget and
-- then rejecting on the minute budget would silently burn quota the user
-- never got to use.
--
-- Rows are locked FOR UPDATE in a deterministic order (sorted by scope) so
-- concurrent calls serialise rather than interleave, and so two callers can
-- never take the same two locks in opposite orders and deadlock.
-- ============================================================================
create or replace function consume_ai_units(p_user_id uuid, p_budgets jsonb)
returns table (allowed boolean, rejected_scope text, used integer, cap integer)
language plpgsql
as $$
declare
  b            jsonb;
  v_scope      text;
  v_window     timestamptz;
  v_cost       integer;
  v_limit      integer;
  v_units      integer;
begin
  -- Materialise every row first, so the FOR UPDATE below always finds one to
  -- lock. Without this, two concurrent first-requests-of-the-day would both
  -- find nothing to lock and both proceed.
  for b in select value from jsonb_array_elements(p_budgets) order by value->>'scope' loop
    insert into ai_usage (user_id, scope, window_start, units)
    values (p_user_id, b->>'scope', (b->>'window')::timestamptz, 0)
    on conflict (user_id, scope, window_start) do nothing;
  end loop;

  -- Pass one: lock everything and check. No writes yet.
  for b in select value from jsonb_array_elements(p_budgets) order by value->>'scope' loop
    v_scope  := b->>'scope';
    v_window := (b->>'window')::timestamptz;
    v_cost   := (b->>'cost')::integer;
    v_limit  := (b->>'limit')::integer;

    select u.units into v_units
    from ai_usage u
    where u.user_id = p_user_id and u.scope = v_scope and u.window_start = v_window
    for update;

    if v_units + v_cost > v_limit then
      return query select false, v_scope, v_units, v_limit;
      return;
    end if;
  end loop;

  -- Pass two: every budget has room, so charge them. The locks taken above
  -- are held until this function's transaction commits, so nothing can slip
  -- in between the check and the charge.
  for b in select value from jsonb_array_elements(p_budgets) order by value->>'scope' loop
    update ai_usage u
    set units = u.units + (b->>'cost')::integer, updated_at = now()
    where u.user_id = p_user_id
      and u.scope = b->>'scope'
      and u.window_start = (b->>'window')::timestamptz;
  end loop;

  return query select true, null::text, null::integer, null::integer;
end;
$$;

-- ============================================================================
-- adjust_ai_units — settle a reservation against what was actually used.
--
-- Transcription is charged before the call, from an estimate based on file
-- size, because the real duration is only known once Whisper answers and by
-- then the money is spent. This reconciles the difference afterwards.
--
-- Clamped at zero: a refund larger than the balance would otherwise drive the
-- counter negative and hand the user free quota.
-- ============================================================================
create or replace function adjust_ai_units(
  p_user_id uuid,
  p_scope text,
  p_window timestamptz,
  p_delta integer
)
returns integer
language plpgsql
as $$
declare
  v_units integer;
begin
  update ai_usage u
  set units = greatest(0, u.units + p_delta), updated_at = now()
  where u.user_id = p_user_id and u.scope = p_scope and u.window_start = p_window
  returning u.units into v_units;

  return coalesce(v_units, 0);
end;
$$;

-- ============================================================================
-- Permissions.
--
-- Postgres grants EXECUTE on a new function to PUBLIC by default, and
-- Supabase's anon/authenticated roles inherit that. Both functions write the
-- quota counters, so anyone holding the project's anon key could call
-- adjust_ai_units with a negative delta and refund themselves.
--
-- Today that attack fails on a second layer — ai_usage has RLS on with no
-- policies, so the UPDATE matches nothing — but that is defence by accident.
-- It depends on this table never gaining a policy, and it fails silently
-- rather than loudly (adjust_ai_units returns 0 whether it zeroed the row or
-- touched nothing at all, which is genuinely hard to tell apart).
--
-- Least privilege instead: only service_role, which is the key the server
-- holds and never ships to a browser, may execute these at all.
revoke all on function consume_ai_units(uuid, jsonb) from public, anon, authenticated;
revoke all on function adjust_ai_units(uuid, text, timestamptz, integer) from public, anon, authenticated;

grant execute on function consume_ai_units(uuid, jsonb) to service_role;
grant execute on function adjust_ai_units(uuid, text, timestamptz, integer) to service_role;

-- Pin the resolution order. Neither function is SECURITY DEFINER, so a
-- hijacked search_path cannot escalate privilege here — but pinning it costs
-- nothing and stops an unqualified name resolving to something in a
-- caller-controlled schema if either is ever changed to DEFINER.
alter function consume_ai_units(uuid, jsonb) set search_path = public, pg_temp;
alter function adjust_ai_units(uuid, text, timestamptz, integer) set search_path = public, pg_temp;

