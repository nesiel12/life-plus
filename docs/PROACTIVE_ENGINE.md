# Proactive Engine — M2 design

> The Proactive Engine is what makes Atlas *Atlas*. Everything before it was reactive: the user opens
> the app, the app shows them synthesised data. The Proactive Engine runs **without the user present**,
> notices things, and reaches out. This document is the architecture; `docs/ATLAS_BIBLE.md` §7 is the
> milestone scope. Status: **scaffolding in place, jobs being implemented.**

---

## 1. What it must do

1. **Run scheduled work per user, unattended** — nightly and early‑morning batches, plus lighter
   sweeps through the day.
2. **Produce notifications**, not just in‑app cards — a proactive system that only speaks when the app
   is already open is a contradiction. Channels: in‑app centre, transactional email, Web Push
   (stretch), **WhatsApp** (two‑way).
3. **Respect the user** — quiet hours, per‑kind and per‑channel preferences, hard frequency caps, and
   dedupe so the same nudge never lands twice.
4. **Stay deterministic and explainable** — every proactive item carries its "על סמך…" reason and is
   Approve/Modify. No autonomous action. AI is used for *phrasing and synthesis*, never to decide to
   fire an irreversible action on its own.
5. **Be idempotent** — a job that runs twice (retry, overlap, manual trigger) must not double‑produce.

---

## 2. Data model (migration `20260831000000_proactive_engine.sql`)

### `job_runs` — the execution ledger
One row per (job, scope, run). Gives idempotency and observability.

| column | notes |
|---|---|
| `id` uuid pk | |
| `job_name` text | `daily_insight`, `morning_briefing`, `reminder_sweep`, `recommendation_expiry`, `busy_week_scan` |
| `scope_key` text | usually `user_id`, or `global` for cross‑user sweeps |
| `run_date` date | the logical day the run is *for* (not wall‑clock) — the idempotency key with `job_name` + `scope_key` |
| `status` text | `running` \| `succeeded` \| `failed` \| `skipped` |
| `items_produced` int | notifications/insights/etc. emitted |
| `detail` jsonb | freeform: counts, skip reason, error message |
| `started_at` / `finished_at` timestamptz | |

Unique on `(job_name, scope_key, run_date)` — a second attempt for the same logical day is a no‑op
unless the prior run `failed`.

### `notifications` — everything Atlas wants to tell the user
| column | notes |
|---|---|
| `id` uuid pk, `user_id` uuid fk | |
| `kind` text | `daily_insight`, `briefing_ready`, `reminder_family`, `reminder_review`, `reminder_medical`, `milestone_slipping`, `busy_week`, `suggestion` |
| `title` text, `body` text | Hebrew, ready to render/send |
| `reason` text | the "על סמך…" attribution |
| `action` jsonb | optional — `{ type, payload }` for an Approve/Modify affordance (e.g. `create_calendar_event`, `open_route`, `mark_contacted`) |
| `channels` text[] | which channels this went to: `in_app`, `email`, `push`, `whatsapp` |
| `dedupe_key` text | stable hash of (kind + salient entity + logical day). Unique per user. |
| `status` text | `pending` \| `sent` \| `read` \| `acted` \| `dismissed` \| `expired` |
| `scheduled_for` timestamptz | when it should surface/send (respects quiet hours) |
| `sent_at`, `read_at`, `acted_at` timestamptz | |
| `expires_at` timestamptz | after which an un‑acted item is swept to `expired` |
| `created_at` timestamptz | |

Index: `(user_id, status, scheduled_for)`, unique `(user_id, dedupe_key)`.

### `notification_preferences` — one row per user
| column | notes |
|---|---|
| `user_id` uuid pk fk | |
| `quiet_hours_start` / `quiet_hours_end` smallint | local hour 0–23; nothing sends in the window (in‑app still queues) |
| `channel_email` / `channel_push` / `channel_whatsapp` boolean | master per‑channel switch (`in_app` is always on) |
| `muted_kinds` text[] | kinds the user turned off |
| `whatsapp_number` text | E.164; null until the user connects WhatsApp |
| `max_per_day` smallint default 6 | hard cap across all proactive notifications |
| `updated_at` timestamptz | |

Row auto‑created by `events.signIn` alongside `personal_dna` (sensible defaults: quiet 22→7,
email on, push/whatsapp off).

> `recommendation_events` already exists and stays the store for accept/reject feedback on
> suggestions — the Proactive Engine writes a `notification` *and*, when the notification is a
> suggestion, a linked `recommendation_events` row, so the existing feedback‑weighting loop keeps
> working unchanged.

---

## 3. Code shape

```
lib/proactive/
  index.ts            — public surface (runJob, listDueNotifications)
  types.ts            — JobName, JobContext, JobResult, ProactiveNotification
  runJob.ts           — orchestrator: claims a job_runs row, iterates users, calls the job, records result
  quietHours.ts       — pure: isWithinQuietHours(hour, start, end)      [tested]
  dedupe.ts           — pure: buildDedupeKey(kind, entityId, logicalDay) [tested]
  schedule.ts         — pure: nextSendTime(now, prefs) honoring quiet hours + daily cap [tested]
  jobs/
    dailyInsight.ts        — nightly: run the Intelligence Engine, persist one insights row + a notification
    morningBriefing.ts     — early AM: pre-compute /api/briefing, attach DNA focus-window guidance
    reminderSweep.ts       — family contact overdue / shiur review due / milestone slipping / medical test due
    recommendationExpiry.ts— sweep pending recommendation_events + notifications past expires_at → expired
    busyWeekScan.ts        — read next 7 days of Google Calendar; if load > threshold, propose recovery blocks
lib/db/
  jobRuns.ts
  notifications.ts
  notificationPreferences.ts
lib/notify/
  index.ts            — send(notification, channels): fan-out
  channels/inApp.ts   — just persists (already done by the job); marks in_app
  channels/email.ts   — transactional email (provider TBD: Resend) — STUB until creds
  channels/whatsapp.ts— WhatsApp Business send — STUB until creds
app/api/cron/[job]/route.ts — POST, Bearer CRON_SECRET, calls runJob(job). The only external trigger.
```

### Job contract
```ts
type JobResult = { itemsProduced: number; detail?: Record<string, unknown> };
type Job = {
  name: JobName;
  scope: "per_user" | "global";
  run(ctx: JobContext): Promise<JobResult>;   // ctx has userId (per_user), db repos, ai, now, logicalDay
};
```
`runJob` handles: idempotency (`job_runs` unique key), per‑user iteration for `per_user` jobs,
try/catch → `failed` with the error in `detail`, and never throwing to the caller.

---

## 4. Scheduling / trigger

The engine is trigger‑agnostic — `POST /api/cron/{job}` with `Authorization: Bearer $CRON_SECRET` runs
one job for all due scopes. Two supported drivers, pick at deploy time (**founder/deploy decision**,
noted in BACKLOG):

- **Vercel Cron** (`vercel.json` `crons`) — simplest if Atlas deploys to Vercel.
- **Supabase scheduled functions** (`pg_cron` + `pg_net` calling the route) — keeps it inside Supabase.

Local dev: a `npm run cron:<job>` script hits the route directly. No scheduler needed to build/test the
jobs — they're plain functions.

Cadence (all times user‑local, resolved from `personal_dna` timezone inference):
| Job | When |
|---|---|
| `daily_insight` | 03:00 |
| `morning_briefing` | 05:30, or 90 min before the user's earliest known wake/first event |
| `reminder_sweep` | 07:00 and 17:00 |
| `recommendation_expiry` | 02:00 |
| `busy_week_scan` | Sunday 18:00 |

---

## 5. Personal DNA wiring (part of M2)

Today `personal_dna.peak_focus_hours` / `learning_style` only lightly touch a rationale string. M2
closes this:
- `buildAtlasContext` already assembles context; add DNA‑derived signals to the **ranking** input of
  `lib/intelligence/core/rank.ts` (a focus‑window match boosts a study/deep‑work suggestion's score,
  not just its text).
- The chat system prompt (`lib/chatSystemPrompt.ts`) gets a compact DNA block ("שעות מיקוד: 9–11,
  16–18; נטייה לדחיינות אחרי 21:00; סגנון למידה: ויזואלי") so the Companion's advice is personalised.
- `morningBriefing` uses the focus windows to phrase concrete guidance.

---

## 6. Semantic chat memory (part of M2)

`/api/chat` currently passes recent raw turns. Add retrieval:
- New migration adds a `pgvector` embedding column to `moments`, `knowledge_entries`, `summaries`
  (or a shared `embeddings` table keyed by (source_table, source_id)).
- A small `lib/memory/embed.ts` (OpenAI `text-embedding-3-small` or a Gemini equivalent; honest
  fallback → keyword `rankRelevance`, which already exists).
- `retrieveMemory` gains a vector path; chat context includes the top‑k relevant past items, not just
  the last N messages.

---

## 7. Integration layers (scaffolded in M2, completed later)

| Layer | M2 deliverable | Needs |
|---|---|---|
| **WhatsApp** | `lib/notify/channels/whatsapp.ts` stub + inbound webhook route `app/api/whatsapp/webhook` (signature verify, message → command parse via existing `/api/commands/interpret`, reply). | Meta WhatsApp Business API **or** Twilio creds → **founder stop**. |
| **Second Brain** | `lib/secondBrain/` — parsers for markdown / Obsidian / Notion export; maps notes → `knowledge_entries` with backlinks preserved as `moments`/links. Import route `app/api/second-brain/import`. | A file upload UX (M4). |
| **Screen Time** | `lib/health/screenTime.ts` — ingest endpoint `app/api/health/screen-time` accepting daily totals + per‑category; writes to `health_logs` (or a new `screen_time_logs`); feeds the M6 correlation engine. | Client capture (web: Atlas‑tab time, honestly labelled; native/OS export later). |

---

## 8. Definition of Done for M2

- `job_runs`, `notifications`, `notification_preferences` migrated to the live DB; repos + types in.
- All five jobs implemented, each producing real notifications for the founder's account, verified via
  a `npm run cron:*` local run against live data.
- Quiet hours, daily cap, dedupe, and per‑kind mute all enforced (unit‑tested).
- In‑app notification centre renders the queue (Hebrew, Approve/Modify); email channel live via Resend.
- Personal DNA visibly changes ranking + chat tone.
- Semantic chat memory returns relevant past items.
- WhatsApp + Second Brain + Screen Time scaffolds compile and are documented as "awaiting X".
- `lint && typecheck && test && build` green; `BACKLOG.md` + `ATLAS_BIBLE.md` updated; milestone commit.
