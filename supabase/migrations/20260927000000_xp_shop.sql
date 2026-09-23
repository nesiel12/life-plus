-- ----------------------------------------------------------------------------
-- learning_purchases — the Life Plus XP Shop's purchase ledger.
--
-- The app's one universal rule about XP, stated first in lib/learning/xp.ts
-- and repeated in every masterclass migration since: it is derived from
-- history, never a stored running counter. A shop that lets people spend XP
-- would otherwise be the one place that breaks — so it doesn't store a
-- balance at all. This table is an append-only log of what was bought and
-- for how much; "available XP" is computed at read time as
-- earned (lib/learning/xp.ts's labStats, unchanged) minus sum(cost_xp) here
-- (lib/learning/xpShop.ts's availableXp). Never updated or deleted.
--
-- item_id is a free-text key into the static catalog in
-- lib/learning/xpShop.ts, not a foreign key — the catalog (theme/badge/
-- trail/shield definitions and their prices) is code, not user data.
-- ----------------------------------------------------------------------------

create table if not exists learning_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  item_id text not null,
  cost_xp integer not null check (cost_xp > 0),
  purchased_at timestamptz not null default now()
);

create index if not exists learning_purchases_user_idx on learning_purchases(user_id, purchased_at desc);
alter table learning_purchases enable row level security;

-- ----------------------------------------------------------------------------
-- learning_active_cosmetics — what's currently equipped, one row per user.
--
-- Owning an item (a learning_purchases row exists) is not the same as
-- wearing it. This is the one piece of state in the whole shop that is a
-- real mutable pointer rather than derived from history — "which theme is
-- on right now" has no history to compute it from, unlike XP.
-- ----------------------------------------------------------------------------

create table if not exists learning_active_cosmetics (
  user_id uuid primary key references users(id) on delete cascade,
  active_theme text,
  active_particle_trail text,
  updated_at timestamptz not null default now()
);

alter table learning_active_cosmetics enable row level security;

create trigger learning_active_cosmetics_set_updated_at
  before update on learning_active_cosmetics
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- learning_streak_shield_consumptions — which calendar days a Streak Shield
-- actually saved.
--
-- A shield "purchase" is just generic inventory (a learning_purchases row
-- with item_id = 'streak_shield'); consuming one to cover a specific missed
-- day is a separate, dated event recorded here, checked by
-- app/api/torah/insights/route.ts (shared with the Torah module — the
-- streak it protects is the one streak already shown everywhere, not a
-- forked Learning-only copy) via lib/learning/streakShield.ts. Available
-- shield count is itself derived: count(purchases where
-- item_id='streak_shield') minus count(rows here) — the same
-- derive-don't-store rule, one level up.
-- ----------------------------------------------------------------------------

create table if not exists learning_streak_shield_consumptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  covers_date date not null,
  consumed_at timestamptz not null default now()
);

create unique index if not exists learning_streak_shield_consumptions_key
  on learning_streak_shield_consumptions(user_id, covers_date);

alter table learning_streak_shield_consumptions enable row level security;
