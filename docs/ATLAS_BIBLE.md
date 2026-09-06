# LIFE PLUS BIBLE — the canonical source of truth

> **Naming (2026‑09‑01):** the product is now **Life Plus** (formerly *Atlas*). All user‑facing copy,
> the AI persona, `APP_NAME`, `package.json`, and the dev launch config use *Life Plus*. Internal code
> identifiers (`useAtlasStore`, `buildAtlasContext`, `AtlasContext`, `AtlasState`) and the
> `docs/ATLAS_*.md` filenames deliberately still carry *Atlas* — renaming ~250 references and the doc
> filenames was scoped out. When you read "Atlas" in code, comments, or these docs, it means Life Plus.
>
> This is the permanent, continuously‑maintained source of truth for Life Plus: what it is, the principles
> it is built on, how the system is shaped, where things live, what is done, what is next, and the
> rules that must never be broken. Read this first, every session. For the detailed architecture and
> the running build log, read `docs/ATLAS_ARCHITECTURE_VISION.md` (§1–§19). For the day‑to‑day task
> list, read `docs/BACKLOG.md`. For a session kickoff checklist, read `docs/ATLAS_SESSION_BRIEF.md`.
>
> Last consolidated: 2026‑08‑31 (M1). Supersedes `ATLAS_PRODUCT_STRATEGY.md`, `ATLAS_UX_SPEC.md`,
> `ATLAS_MVP_PRODUCT_SPEC.md` (kept as historical framing only — see §10).

---

## 1. Vision

Atlas is a **Life Operating System (LifeOS)**: an AI‑based personal assistant that knows the user
deeply, learns them over years, manages their time, knowledge, health and relationships, and
**proactively initiates** actions and recommendations so they live a more organised, balanced, and
meaningful life.

It is **not** a task manager, **not** a calendar, **not** an AI chat box. Those are commodities it
contains. The product is the *understanding* and the *initiative* — the thing the user pays for is
insight and a system that acts on their behalf, not another place to store data.

The founder has chosen the **full LifeOS** scope (all ten areas, all fourteen modules below) over any
narrower "reflection‑partner" framing. Every product decision is checked against that.

---

## 2. Principles (priority order)

1. **Proactive over reactive.** Atlas initiates. It does not wait for commands. The user's role is to
   **approve or adjust** ("אישור / שינוי"), never to operate a tool.
2. **Holistic integration.** Sleep → focus → study/work → family time. Atlas reasons and plans across
   areas, not per silo.
3. **Personal memory that compounds.** Every interaction makes Atlas more personal. It learns how the
   user learns, when they focus, who lifts their mood, which habits work, when they procrastinate,
   what drives their success — and uses it in every recommendation.
4. **Deterministic and explainable.** The intelligence/ranking layer is transparent — every
   recommendation carries its "על סמך…" attribution and is reversible. No black‑box scoring, no
   autonomous agent acting unattended.
5. **Honest AI.** When a provider is unavailable, degrade honestly — never fabricate a response.
6. **Hebrew‑first, RTL‑perfect.** The entire UI, every piece of UX copy, every empty/error/loading
   state, and the AI's conversational voice are in fluent, natural, modern Israeli Hebrew.
7. **Luxe, not loud.** The interface is *premium* — crisp white, metallic gold, deep black; generous
   whitespace; clear hierarchy; deliberate motion. Every screen still leads with synthesis ("what
   matters now") before records, and empty states stay honest — but the register shifted (2026‑09‑01)
   from "quiet minimalism" to "considered, high‑end, and quietly delightful": tasteful entrance
   animations, kinetic/typing treatments on primary headings, a bento‑grid dashboard, and celebratory
   micro‑interactions (confetti / cool‑mode) on genuine wins. Restraint now means *editing* the
   effects to where they earn their place, not avoiding them. See `docs/ATLAS_UX_SPEC.md` §Visual
   Direction and §Design System for the palette, tokens, and component rules.

### 2.1 Design system (summary — full spec in `ATLAS_UX_SPEC.md`)

- **Palette:** white‑first. `--background` warm paper `#f8f7f4`, `--surface` white, `--foreground`
  near‑black `#16151a`, `--muted` `#6b6a71`. Brand accent **gold** — `--gold` `#b89355` (decor/large),
  `--gold-ink` `#876628` (small text on white, ~5:1). Deep black `--ink` `#101014` for occasional
  high‑contrast elements. Dark theme is a first‑class opt‑in via the Theme Toggler
  (`[data-theme="dark"]` on `<html>`), **not** driven by `prefers-color-scheme`.
- **Life‑area accents** map to the logo's woven‑ribbon brain: faith=gold, family=magenta `#cc1f78`,
  knowledge=blue `#1a72bb`, health=green `#2f9e44`.
- **Tokens** live in `app/globals.css` (`@theme inline`). Semantic fills: `--fill-subtle` / `--fill` /
  `--fill-strong` replace the old `bg-white/N` translucency (codemod done). `.glass-card` is now a
  clean white card (hairline + soft shadow), not a dark translucent pane.
- **MagicUI components** are integrated by hand into this token system (no shadcn / no
  `components.json`) — Kinetic Text, Bento Grid, Animated List, Theme Toggler, Confetti, Typing
  Animation, Number Ticker, Light Rays, Cool Mode, Warp Background.
- **Accessibility is non‑negotiable:** AA contrast on all text (gold text uses `--gold-ink`), gold
  `focus-ring` visible on both themes, ARIA labels on every interactive element, `prefers-reduced-motion`
  collapses every animation.

---

## 3. Product

### 3.1 Three‑layer navigation

| Layer | Routes | Purpose |
|---|---|---|
| **Today** | `/` | The daily home. A live, AI‑curated view of what matters right now — reshaped by time of day, energy level, and urgency. |
| **Areas** | `/areas/*` | The ten life domains, each a real workspace. |
| **Timeline / AI** | `/timeline`, background | AI Memory, Personal DNA, the Intelligence Engine, and the Proactive Engine running silently. |

### 3.2 The ten life areas

📅 Time & smart calendar · 📚 Studies & knowledge · ✡️ Torah (ספרים, שיעורים, רבנים, מקורות, סיכומים,
שאלות) · 👨‍👩‍👧‍👦 Family & relationships · 🤝 Friends & social · 💼 Work & career · 💰 Finances · 🏃
Health & fitness · 📖 Reading & personal development · 🎨 Hobbies.

### 3.3 The fourteen modules (full scope)

1. **Google Auth + Deep Onboarding + Personal DNA.** Google OAuth; never hardcoded to a user —
   everything derives from the connected Google identity. Onboarding is a natural Hebrew conversation
   (one question at a time, greets the user by their Google name) learning family & friends, studies,
   career, goals & dreams, habits, sleep schedule, focus hours, hobbies, preferences. The **Personal
   DNA Engine** continuously refines focus hours, learning style, motivation triggers, procrastination
   patterns, creative windows, work patterns — and feeds daily planning.
2. **Proactive AI + Smart Calendar.** Connected to Google Calendar. Scans real free windows; accounts
   for energy/focus (DNA), location, travel time and traffic. Proactively suggests: create event, call
   a family member, schedule study/workout/rest, reflow the schedule. Every suggestion is Approve/Modify.
3. **Learning & Knowledge Hub.** Upload PDF, notebook photos, audio, documents, video → summary,
   explanation, **review questions + flashcards + mind‑maps**, links to past material, progress
   tracking, outputs wired into daily tasks. Daily & weekly learning recaps.
4. **Torah Space.** A distinct specialised environment. Upload shiur audio → transcript, summary,
   explanation, review questions, **contextual links to previous shiurim**, building a personal Torah
   library over years.
5. **Family, Friends & Relationship CRM.** Profiles for meaningful people: birthdays, anniversaries,
   gifts, interests, important dates, last‑contact, relationship goals. Proactively suggests call /
   meet / gift / quality time. **Meeting Coordinator**: pick people → check mutual availability → propose
   time + location → send invites → sync calendars.
6. **Health & Wellness.** Trackers: sleep, steps, hydration, workouts, mood, medical tests,
   medications. **Correlation engine** surfacing honest findings ("המיקוד שלך גבוה ב‑30% בימים שישנת 7
   שעות ושתית מספיק מים").
7. **Goals Engine.** Macro‑goal → full timeline: sub‑plan, daily micro‑tasks, scheduled milestones,
   reviews, progress tracking, knowledge tests. Milestones land in the calendar.
8. **AI Memory + Life Timeline.** **AI Memory** — the multi‑year engine powering all personalised
   recommendations. **Life Timeline** — a visual, scrollable, multi‑year view of studies, jobs, books,
   achievements, trips, family events, goals reached; shows trajectory, not just history.
9. **Day & Week Summaries.** End of day: learned, progress, screen time, workouts, family time,
   completed tasks, "the good moment of today", what to improve tomorrow. End of week: charts,
   achievements, habit consistency, health, learning + **trivia generated from that week's learning** +
   next‑week recommendations.
10. **Predictive AI Engine.** Background pattern analysis: anticipates busy weeks and pre‑clears
    recovery time; context‑aware morning guidance ("היום ב‑16:00 יש לך חלון מיקוד חזק של שעתיים…");
    watches sleep/movement/learning continuity and proposes a proactive break when energy dips.
11. **Co‑Learning.** Personalised test questions, mind‑maps, flashcards from uploaded material wired
    into daily tasks; multi‑year progress connecting projects, masechtot, and financial goals into one
    trajectory.
12. **Next‑gen interface.** A **live Today view** updating with time of day, energy, urgency. A
    **floating AI panel** taking free voice or text ("היה לי יום עמוס, תעביר את מה שלא דחוף למחר ותפנה
    לי את הערב לחברים") and executing the whole resulting change set on one approval.
13. **Screen Time + real personal guidance.** Honest measurement (labelled for what a web app can
    actually see), paired with AI guidance that speaks from **specific learned facts** about this user.
14. **Reminders & notifications.** Gentle, personal, well‑timed reminders delivered through real
    notification infrastructure, not just in‑app cards.

### 3.4 Strategic integration layers (roadmap — see §7)

- **WhatsApp** — proactive prompts, quick summaries, and two‑way interaction (approve a calendar
  change, log water, ask for a schedule update) via a secure webhook/API layer. Needs external
  credentials (Meta WhatsApp Business API or Twilio).
- **Second Brain sync** — import/sync markdown, Obsidian vaults, Notion exports, web clippings; the
  Learning Hub and AI Memory index and connect this external knowledge to tasks, Torah study, goals.
- **Screen Time / Digital Wellness** — track digital habits, feed into the Health tracker and AI
  Memory to correlate screen fatigue with focus and sleep.

---

## 4. Architecture

**Stack:** Next.js 15.5 (App Router, Turbopack) · React 19 · TypeScript strict · Tailwind v4
(CSS‑first `@theme`, no config file, dark‑only, `dir="rtl"` + `lang="he"`) · Zustand 5 (client cache,
not source of truth) · NextAuth v4 (Google OAuth, JWT sessions) · Supabase Postgres · Vercel AI SDK v7
(`ai` + `@ai-sdk/openai` + `@ai-sdk/google`) behind `lib/ai/` · Vitest · GitHub Actions CI.

**Data‑flow model** (not a service model — this all lives inside the Next app):
`User Data → Life Events → Memory Engine → Personal DNA → Context Engine → AI Agents → Recommendations`
(reversible, attributable). Detail: `docs/ATLAS_ARCHITECTURE_VISION.md` §1–§9.

**Where things live:**

| Concern | Location |
|---|---|
| Routes / pages | `app/` (App Router); areas under `app/areas/*` |
| API routes | `app/api/*` — all session‑checked, zod‑validated (`lib/api/parseJsonBody.ts`), rate‑limited (`lib/api/rateLimit.ts`) |
| Server actions | `app/actions/*` — one module per domain; all go through `lib/currentUser.ts` |
| DB repositories | `lib/db/*` — user‑scoped via `lib/db/createUserScopedRepo.ts`; never trust a client‑passed id |
| Auth | `lib/auth.ts` (Google OAuth, `calendar.events` scope, open sign‑up — any Google account, `events.signIn` provisions the user row + `personal_dna`) |
| Intelligence Engine | `lib/intelligence/core/*` — deterministic normalize → rank → detect conflicts → format |
| Personal DNA | `lib/intelligence/personalDNA/*` — analyzers (focus, goals, learning, routine) + confidence + timezone |
| Recommendations | `lib/intelligence/recommendations/*` — dedupe, feedback weighting, tracking (`recommendation_events`) |
| Per‑request context | `lib/context/buildAtlasContext.ts` |
| Memory retrieval | `lib/memory/*` |
| AI provider layer | `lib/ai/*` — OpenAI or Gemini by configured key; honest fallback when neither |
| Client cache | `store/useAtlasStore.ts` — `hydrate()` from `app/actions/bootstrap.ts` |
| Migrations | `supabase/migrations/*` — timestamped, idempotent; runner `scripts/apply-migrations.mjs` (tracks `_migrations`) |
| DB types | `types/database.ts` |
| UI primitives | `components/ui/*` (`GlassCard`, `Modal` + `Z_INDEX`), `components/layout/*`, `components/features/*` |

**Tenant isolation:** disciplined `user_id` filtering in `lib/db/*` + the service‑role key. RLS is
enabled on every table with **zero policies by design** (documented in the init migration) — the repo
layer is the boundary, not RLS. If any feature ever queries Supabase directly from the client, real
RLS policies become mandatory first.

**Schema extension:** migration‑only. New domain = table + `createUserScopedRepo` repo + `app/actions`
module + `types/database.ts` entry + Vitest coverage for any pure logic.

---

## 5. Current state (2026‑08‑31)

**Repo:** `~/Documents/Atlas` (flat). Branch `master`, HEAD after M0 = `188bd84`. **No git remote yet**
— the local repo + the Supabase DB are the only copies. `npm run lint / typecheck / test (251) / build
(41/41)` all green.

**Foundation — done:** security (session guards, zod, rate limiting, server‑side Google token,
fail‑closed allow‑list); persistence (21 migrations, 27 code‑referenced tables + 8 orphan, 22
user‑scoped repos, 21 action modules, Zustand as cache); Intelligence Engine + Personal DNA +
Recommendation Intelligence + Context Engine + memory retrieval; dual AI provider layer with honest
fallback; Vitest + CI.

**Feature spaces — built (Phases 5–10):** Today dashboard; `/areas/time` (tasks, habits, manual
events, merged daily timeline, AI task suggestions/prioritisation); `/areas/finances`;
`/areas/learning` (topics + AI Track Builder); `/areas/health` (meals, workouts, AI Nutrition Coach);
`/areas/torah` (Torah Library + real shiur transcription/summary pipeline); `/areas/family`
(Relationship CRM + meetup suggestions); `/areas/career` (thin); `/calendar` (real Google Calendar
read, grouped, free‑slot calc, scheduled‑events injected into AI context); `/timeline`; the AI
Companion (streaming chat, pin, based‑on reasoning, chat→task); Deep Onboarding; AI Command Panel
(5 intents); Gemini as second provider.

**M0 verified (2026‑08‑31):** `.env.local` wired to Supabase `mvlsahvtmdgidodgwkso`; all 21 migrations
already applied; `scripts/verify-phase1.mjs` 12/12; `scripts/verify-live-walkthrough.mjs` all pass
(founder provisioning + full bootstrap read path + write/read/delete round‑trip + isolation); dev
server boots clean; every `/api/*` returns 401 unauthenticated. **Still open:** a real in‑browser
Google sign‑in click‑through (needs the founder — the assistant cannot enter Google credentials); the
git remote + push.

**M1 done (2026‑08‑31):** this document created as the canonical source of truth; narrow‑MVP docs
banner‑marked SUPERSEDED.

**M2 in progress (2026‑08‑31):** design in `docs/PROACTIVE_ENGINE.md`. Landed & verified against the
live DB:
- migration `20260831000000_proactive_engine.sql` (`job_runs`, `notifications`,
  `notification_preferences`)
- `lib/proactive/*` — pure helpers `quietHours`/`dedupe`/`schedule`/`withTimeout` (+16 tests); `runJob`
  orchestrator (lazy `JOB_LOADERS`, idempotency incl. orphaned‑`running` reclaim, per‑user fan‑out,
  never throws)
- `lib/db/{notifications,notificationPreferences,jobRuns}.ts`; `lib/notify/*` (fan‑out + email/whatsapp
  channel stubs)
- **2 jobs live:** `recommendation_expiry` (ran: expired 8 stale events) and `daily_insight` (ran:
  Intelligence Engine → Hebrew insight, AI‑with‑timeout→deterministic fallback, wrote an `insights`
  row + a `daily_insight` notification; idempotent re‑run confirmed)
- `POST /api/cron/[job]` (Bearer `CRON_SECRET`); local runner `npm run cron -- <job>`
- `notification_preferences` row auto‑created on sign‑in; `.env.example` gains `CRON_SECRET`

**Next in M2:** the 3 remaining jobs (`morning_briefing`, `reminder_sweep`, `busy_week_scan`); the
notification centre UI + real email channel (Resend); Personal DNA → ranking/chat wiring; semantic
chat memory; the WhatsApp / Second‑Brain / Screen‑Time scaffolds; private activation/retention
instrumentation (`user_events`) per `docs/MONETIZATION_STRATEGY.md` §5.

**Lost work (failed machine sync, post‑Phase‑10, uncommitted):** an **Academy** feature (courses,
stages, exams, certification, trivia), **Daily/Weekly Wrap‑up + Reminders Hub**, **Smart Calendar v2**
(`twin-ai`, `torah-info`, `/calendar/smart`), a **"Museum of Life" Timeline** redesign, a **Voice
Agent**, `LifeSimulatorModal`, `AtlasVisionInput`, `DnaOnboarding`, `AmbientLighting`. Fragments in
`~/Documents/Atlas_recovered_wip/`; the DB still has the tables (`courses`, `course_stages`,
`certifications`, `stage_progress`, `daily_reflections`, `smart_events`, `fluid_tasks`, `energy_logs`)
— DDL at `docs/recovery/LIVE_SCHEMA_SNAPSHOT.sql`. Check macOS Trash / Time Machine / OneDrive web
version history before rebuilding; otherwise these map onto Milestones 3, 9, 10, 12.

**The honest gap:** nothing is proactive yet (no scheduler); "accept calendar suggestion" writes
locally, not to Google Calendar; Personal DNA barely affects behaviour; the Learning Hub has no real
multi‑format pipeline; chat memory is shallow; Health has no correlation engine; no Day/Week summaries,
Life Timeline v2, Friends CRM, Meeting Coordinator, Screen‑Time guidance, or notifications.

---

## 6. Definition of Done (every feature, every milestone)

1. Works end‑to‑end against the real Supabase DB for the signed‑in Google user; persists across
   reload; strictly isolated per user.
2. Hebrew + RTL correct everywhere — labels, buttons, AI copy, errors, empty & loading states.
3. All four states designed: populated, empty (quiet, honest), loading (skeleton), error (actionable
   Hebrew). No dead ends.
4. Visually consistent — built from `GlassCard` / `Modal` / existing accent tokens / spacing scale.
   Mobile‑first responsive. Calm Framer Motion (150–300ms), honoring `prefers-reduced-motion`.
5. AI paths: real when a key is set, honest fallback when not; session‑checked, zod‑validated,
   rate‑limited. Never fabricate.
6. Proactive where the vision calls for it — anything the user should be told about goes through the
   Proactive/Notification engine, not just an in‑app card.
7. Tested: pure logic has Vitest unit tests; `lint && typecheck && test && build` all green.
8. Documented: `BACKLOG.md` updated; this file updated if architecture/product direction changed;
   milestone commit with a clear message.
9. Verified by a real authenticated click‑through — not just tests.

---

## 7. Roadmap

Work as autonomous milestones. Read this file + `BACKLOG.md` + `ATLAS_ARCHITECTURE_VISION.md` before
each. Each milestone ends with green checks, a real verification, a `BACKLOG.md` update, and a commit.

- **M0 — Operational readiness.** *(done bar the in‑browser sign‑in + git remote.)*
- **M1 — Doc consolidation.** *(this document.)*
- **M2 — The Proactive Engine.** The defining gap. Background job runner (Supabase scheduled functions
  or Vercel Cron) with a per‑user job ledger + idempotency. Jobs: nightly daily‑insight; early‑morning
  briefing pre‑compute with DNA‑aware focus‑window guidance; reminder sweep (family contact overdue,
  shiur review due, milestone slipping, medical test due); `recommendation_events` expiry sweep;
  busy‑week detection → proactive recovery time. **Notification infrastructure**: in‑app centre +
  transactional email; Web Push stretch; **WhatsApp channel** (external creds → founder stop). Wire
  `personal_dna` into Intelligence Engine ranking and the chat system prompt. Semantic memory
  retrieval for chat (embeddings over `moments` + `knowledge_entries` + `summaries`). Design:
  `docs/PROACTIVE_ENGINE.md`.
- **M3 — Today View v3 + floating AI panel.** Time/energy/urgency‑reshaped Today; free text + voice
  (Web Speech API, Hebrew) executing compound plans as one reviewable diff.
- **M4 — Learning & Knowledge Hub (real).** Multi‑format upload → summary + explanation + review
  questions + flashcards + mind‑map + links + progress; flashcard review in the daily timeline;
  daily/weekly learning recaps. **Second Brain sync** import path.
- **M5 — Calendar Intelligence.** "Accept" writes the real Google Calendar event; energy/focus/
  travel‑aware auto‑scheduling; task reflow; Meeting Coordinator.
- **M6 — Health depth + correlation engine.** Sleep/steps/hydration/mood/tests/meds trackers; honest
  evidenced correlations on Today + weekly dashboard. **Screen Time** ingestion feeds here.
- **M7 — Goals Engine v2.** Macro‑goal → plan + milestones + daily micro‑tasks scheduled into the
  calendar + reviews + knowledge tests + trajectory.
- **M8 — Screen Time + Personal Guidance surface.** Honest measurement; AI guidance from specific
  learned facts.
- **M9 — Day & Week Summaries.** Auto end‑of‑day recap + end‑of‑week dashboard + trivia from the
  week's learning. *(Recover `daily_reflections` work if possible.)*
- **M10 — Life Timeline v2 ("Museum of Life").** Visual scrollable multi‑year timeline.
- **M11 — Friends CRM + Torah/Family deepening.** Friends distinct from Family; richer Torah library;
  relationship‑goal tracking.
- **M12 — SaaS surface + billing.** Account settings, data export, delete, privacy/ToS, PWA,
  notification prefs; real RLS policies + open sign‑up. **Billing is gated on the retention bar in
  `docs/MONETIZATION_STRATEGY.md` §5, not a date** — do not build a payment provider integration
  before it's met. Tier architecture and the three upgrade triggers are designed in that doc now so
  gating is a one‑line entitlement check later.

---

## 8. Rules Claude must never break

1. **Hebrew‑first, RTL‑perfect.** No English in the user‑facing product.
2. **Per‑user isolation.** Every read/write scoped to the authenticated user id. Never trust client
   filtering. Never expose the Google token or any secret to the client.
3. **The AI never lies.** No fabricated responses when a provider is unavailable. Every recommendation
   reversible and attributable.
4. **Approve/Modify, always.** Atlas proposes; the user disposes. No irreversible action fires without
   explicit confirmation. No silent auto‑commit to a calendar or to anyone else.
5. **Determinism & explainability** in the intelligence/ranking layer. No opaque scoring, no
   unattended multi‑step agent.
6. **Preserve working systems.** Phases 5–10 ship value — improve incrementally, don't rewrite.
7. **Green or revert.** Never commit with lint/typecheck/test/build failing.
8. **Migrations only** for schema change. No destructive migration without explicit founder approval.
9. **Don't hardcode the user.** Everything derives from the live Google identity.
10. **Stop only for:** external credentials/services, a real product‑vision fork, a
    destructive/irreversible action. Otherwise decide and continue.
11. **Report in milestones**, not micro‑updates.
12. **Accessibility is not optional:** focus‑visible, `prefers-reduced-motion`, ≥44px targets, real
    `<label>`s, a skip‑to‑content link.
13. **Never handle real secrets in plaintext.** `.env.local` values are created by the founder.

---

## 9. Operating model

Claude acts as the permanent Principal Engineer / acting CTO of Atlas. Makes engineering decisions
independently. Groups work into milestones. Reports at milestone boundaries, on a blocker, or when an
external credential is required. Keeps `/docs` current: this file, `BACKLOG.md`,
`ATLAS_ARCHITECTURE_VISION.md`, `ROADMAP_V2.md`.

---

## 10. Document index

| Doc | Role |
|---|---|
| `ATLAS_BIBLE.md` | **This file — canonical source of truth.** |
| `ATLAS_ARCHITECTURE_VISION.md` | Detailed architecture + running build log (§1–§19). Authoritative for *how* the engines work. |
| `BACKLOG.md` | Living task list — what's open, by priority. |
| `ATLAS_SESSION_BRIEF.md` | Session kickoff checklist + current‑state snapshot. |
| `ROADMAP_V2.md` | Infra phases 0–6 (historical framing; the live roadmap is §7 here). |
| `PROACTIVE_ENGINE.md` | M2 design doc — job ledger, notifications, channels, scheduling, DNA wiring, integration layers. |
| `MONETIZATION_STRATEGY.md` | Commercial architecture — tiers, feature gates, upgrade triggers, retention loops, and the "don't build billing until the §5 retention bar" sequencing argument. |
| `recovery/LIVE_SCHEMA_SNAPSHOT.sql` | DB schema snapshot — reference for the lost‑WIP tables. |
| `PROJECT_ANALYSIS.md`, `ARCHITECTURE_AUDIT.md`, `TECH_DEBT.md`, `FEATURE_GAP_ANALYSIS.md` | Point‑in‑time audit, 2026‑07‑20, pre‑persistence. **Historical.** |
| `ATLAS_PRODUCT_STRATEGY.md`, `ATLAS_UX_SPEC.md`, `ATLAS_MVP_PRODUCT_SPEC.md` | Early narrow "reflection‑partner" framing. **Superseded by §1–§3 here** — kept for history. |
| `ATLAS_TECHNICAL_PLAN.md`, `DEVELOPMENT_PROTOCOL.md` | Early planning / operating notes. Folded into §8–§9 here. |
