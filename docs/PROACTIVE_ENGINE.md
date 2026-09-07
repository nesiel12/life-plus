# Proactive Engine — M2 design

> The Proactive Engine is what makes Atlas *Atlas*. Everything before it was reactive: the user opens
> the app, the app shows them synthesised data. The Proactive Engine runs **without the user present**,
> notices things, and reaches out. This document is the architecture; `docs/ATLAS_BIBLE.md` §7 is the
> milestone scope. Status: **live** — all jobs implemented, email delivery wired, cron deployed.

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
  timezone.ts         — pure: resolve/validate an IANA zone, local day bounds, next local hour [tested]
  jobs/
    dailyInsight.ts        — nightly: run the Intelligence Engine, persist one insights row + a notification
    morningBriefing.ts     — self-gates to the user's local 07:00; real Google Calendar + tasks + relationships
    reminderSweep.ts       — fires manual_events.reminder_minutes (its first ever consumer)
    scheduleTransition.ts  — "training in 20 minutes", plus what is free afterwards
    relationshipNudge.ts   — one overdue contact a day; the producer for `reminder_family`
    recoverySupport.ts     — anodyne check-in an hour before a declared/learned risk hour
    recommendationExpiry.ts— sweep pending recommendation_events + notifications past expires_at → expired
    busyWeekScan.ts        — read next 7 days of Google Calendar; if load > threshold, propose recovery blocks
    notificationDispatch.ts— the only thing that actually sends (see §4a)
lib/db/
  jobRuns.ts
  notifications.ts
  notificationPreferences.ts
lib/notify/
  index.ts            — send(notification, channels): fan-out
  channels/inApp.ts   — just persists (already done by the job); marks in_app
  channels/email.ts   — Resend over REST; never throws, returns {ok}|{ok:false,error}
  email/renderNotificationEmail.ts — pure RTL Hebrew template [tested]
  email/unsubscribeToken.ts        — HMAC one-click unsubscribe, RFC 8058 [tested]
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

`GET|POST /api/cron/{name}` with `Authorization: Bearer $CRON_SECRET` runs one
job — or one **group** — for all due scopes. Vercel Cron issues GET and injects
that header automatically when an env var of exactly that name exists, so both
verbs are exported.

### Groups, and why they exist

Vercel's free tier allows **two cron entries, each at most once a day**.
Producing a notification and delivering it are deliberately separate jobs
(see §4a), so one-job-per-slot would generate briefings that never get emailed.
`JOB_GROUPS` in `app/api/cron/[job]/route.ts` runs an ordered sequence in one
invocation — producers first, dispatcher last — so anything created in a cycle
goes out in the same cycle.

| Group | Sequence |
|---|---|
| `daily` | recommendation_expiry → daily_insight → morning_briefing → relationship_nudge → reminder_sweep → schedule_transition → recovery_support → notification_dispatch |
| `sweep` | reminder_sweep → schedule_transition → recovery_support → notification_dispatch |
| `weekly` | busy_week_scan → notification_dispatch |

### Deployed cadence

`vercel.json`: `daily` at 05:00 UTC, `sweep` at 15:00 UTC. Schedules are UTC;
05:00Z is 07:00–08:00 in Israel, inside the local 07:00–11:00 window
`morning_briefing` self-gates on. **Moving timezone means changing that hour**
or the briefing skips every day.

Two fixed times a day cannot deliver a 15-minute transition alert, so
`.github/workflows/proactive-sweep.yml` drives the `sweep` group every ~15
minutes for free (and `weekly` on Sundays). It is opt-in — see the file header
for the two repository secrets it needs. Vercel Pro is the dependable
alternative: add `{"path": "/api/cron/sweep", "schedule": "*/15 * * * *"}`.

Local: `npm run cron -- <job>` runs the real code path. Every job also has a
named script (`npm run cron:morning-briefing`, `cron:dispatch`, …).

### User-local scheduling without a per-user scheduler

Cron knows nothing about users. Jobs that must happen at a *user's* hour
self-gate instead: `morning_briefing` returns `status: "skipped"` until it is
07:00 for that person, and `jobRunsRepo.claim` treats `skipped` as
re-claimable, so a later invocation the same day can still do the work. The
first run at or after 07:00 records `succeeded`, and the unique index makes
every later invocation that day a no-op.

## 4a. Decide vs. deliver

`notify()` **persists only**. It resolves channel preferences, computes
`scheduled_for` against the user's quiet hours *in their own timezone*, and
writes the row. In-app delivery is the row existing.

`notification_dispatch` does the sending. Splitting them is what finally made
three things work that shipped in M2 and were never wired up:

- **Quiet hours.** `canSendNow` existed and nothing called it — a 03:00 job
  emailed at 03:00.
- **The daily cap.** `isUnderDailyCap` existed and nothing called it, and
  `countSentSince` reads `sent_at`, which nothing ever stamped.
- **Retry.** A send failing inside the producing job was lost, and that job's
  idempotency key then prevented it ever being retried.

The dispatcher also refuses to send anything older than 12 hours
(`STALE_OUTBOUND_MS`). Without that floor, the first run on an existing
deployment would email the entire backlog of notifications produced before
delivery existed, starting with a daily insight from weeks ago.

When email is unconfigured, `sendEmail` reports success-with-`skipped` and the
dispatcher records **nothing** — stamping `sent_at` would mean that the day
someone adds `RESEND_API_KEY`, every notification produced before then is
permanently marked delivered.

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
| **WhatsApp** | `lib/notify/channels/whatsapp.ts` stub + inbound webhook route `app/api/whatsapp/webhook` (signature verify, message → command parse via existing `/api/commands/interpret`, reply). No longer called by `notify()` — delivery goes through `notification_dispatch`, which is email-only today. | Meta WhatsApp Business API **or** Twilio creds → **founder stop**. |
| **Second Brain** | `lib/secondBrain/` — parsers for markdown / Obsidian / Notion export; maps notes → `knowledge_entries` with backlinks preserved as `moments`/links. Import route `app/api/second-brain/import`. | A file upload UX (M4). |
| **Screen Time** | `lib/health/screenTime.ts` — ingest endpoint `app/api/health/screen-time` accepting daily totals + per‑category; writes to `health_logs` (or a new `screen_time_logs`); feeds the M6 correlation engine. | Client capture (web: Atlas‑tab time, honestly labelled; native/OS export later). |

---

## 8. Definition of Done for M2 — status

- [x] `job_runs`, `notifications`, `notification_preferences` migrated; repos + types in.
- [x] All jobs implemented (nine now, not five), producing real notifications
      for the founder's account, verified via local `npm run cron` runs
      against live data.
- [x] Quiet hours, daily cap, dedupe and per-kind mute all enforced — and now
      actually *invoked*, which they were not (see §4a). Unit-tested.
- [x] In-app notification centre renders the queue (Hebrew, Approve/Modify).
- [x] Email channel live via Resend, with one-click unsubscribe.
- [x] Per-user timezone, inferred from the browser and overridable in
      `/settings`, so "morning" means the user's morning.
- [x] Google Calendar readable without a browser (`google_calendar_credentials`
      + `lib/googleCalendar/serverAccess.ts`) — the morning briefing's whole
      premise.
- [x] Cron deployed (`vercel.json` + a GitHub Actions sweep for the cadence
      the free tier cannot schedule).
- [ ] Personal DNA visibly changes ranking + chat tone.
- [ ] Semantic chat memory returns relevant past items (needs pgvector).
- [ ] WhatsApp scaffold — still awaiting Business API credentials.
- [x] `lint && typecheck && test && build` green.

**Not done, and worth naming:** email delivery has never been observed
end-to-end, because `RESEND_API_KEY` is unset. The dispatcher correctly
reports `skipped` and records nothing in that state; the first real send is
still unproven.
