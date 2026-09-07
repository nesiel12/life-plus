-- The recovery space ("גמילה") — private by construction.
--
-- Everything about this feature is shaped by one requirement: someone else
-- picking up the phone must not be able to read it. That is why the data
-- lives in its own tables rather than as a `habits` variant, why none of it
-- is loaded by the app's bootstrap fan-out, and why reading it at all
-- requires an unlock proven with a device biometric.

-- ── The program itself: one per thing the person is quitting ─────────────
create table recovery_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,

  -- Free text, in the user's own words. Deliberately not a closed list of
  -- substances: naming the thing is the user's business, and an enum here
  -- would both constrain them and encode assumptions about what counts.
  title text not null,

  -- Abstinence with a running streak. `clean_since` is the anchor: the streak
  -- is derived from it and from relapses, never stored as a counter, so it
  -- can never drift out of step with the events that produced it.
  clean_since timestamptz not null,

  -- Why they are doing this, in their own words. Shown back to them at the
  -- moment it is hardest — this is the single most load-bearing field here.
  reasons text[] not null default '{}',

  -- What tends to precede a craving. Feeds the risk-hour support job.
  triggers text[] not null default '{}',

  -- Local hours (0-23) the user says are hardest. A scheduled, quietly
  -- worded message lands shortly before these.
  risk_hours smallint[] not null default '{}',

  -- What they intend to do instead. Offered by the support button.
  coping_strategies text[] not null default '{}',

  -- Milestones already celebrated, in days, so a celebration fires once.
  celebrated_milestones smallint[] not null default '{}',

  is_active boolean not null default true,
  archived_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recovery_programs_user_idx on recovery_programs (user_id, is_active);

-- ── The log: relapses, cravings resisted, check-ins ──────────────────────
create table recovery_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  program_id uuid not null references recovery_programs(id) on delete cascade,

  -- 'relapse' resets the streak. 'urge' is a craving that was survived, which
  -- is the more common and more useful signal: it is what reveals the times
  -- and triggers worth pre-empting.
  kind text not null check (kind in ('relapse', 'urge', 'note')),

  occurred_at timestamptz not null default now(),

  -- 1-5. How strong the craving was, for urge events.
  intensity smallint check (intensity is null or intensity between 1 and 5),

  -- What set it off — free text, matched loosely against programs.triggers.
  trigger text,

  note text,

  created_at timestamptz not null default now()
);

create index recovery_events_program_idx on recovery_events (program_id, occurred_at desc);
create index recovery_events_user_idx on recovery_events (user_id, occurred_at desc);

-- ── The lock: WebAuthn platform credentials ──────────────────────────────
--
-- A blur that hides content already present in the page is theatre — the data
-- is one devtools panel away. Real privacy means the server does not send
-- recovery data at all until an unlock has been proven, which needs a
-- credential to prove it against.
--
-- Only the PUBLIC key is stored. The private key never leaves the device's
-- secure enclave, which is the entire point of the mechanism: this table
-- being read gives an attacker nothing they can authenticate with.
create table recovery_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,

  -- Base64url, as the WebAuthn spec transports it.
  credential_id text not null unique,
  public_key bytea not null,

  -- The authenticator's signature counter, for clone detection. Some
  -- platform authenticators always report 0; that is expected, not a fault.
  counter bigint not null default 0,

  transports text[] not null default '{}',
  device_label text,

  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index recovery_credentials_user_idx on recovery_credentials (user_id);

-- Short-lived registration/authentication challenges. Stored server-side
-- because a challenge the client could choose is not a challenge.
create table recovery_challenges (
  user_id uuid primary key references users(id) on delete cascade,
  challenge text not null,
  purpose text not null check (purpose in ('register', 'authenticate')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table recovery_programs enable row level security;
alter table recovery_events enable row level security;
alter table recovery_credentials enable row level security;
alter table recovery_challenges enable row level security;
