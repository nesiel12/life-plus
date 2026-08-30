# Atlas — Session Brief & Build Directive

> **Canonical source of truth is now `docs/ATLAS_BIBLE.md`** (created in M1, 2026‑08‑31). This brief is
> the session kickoff checklist + current‑state snapshot; the BIBLE holds the vision, principles,
> architecture map, roadmap, Definition of Done, and the rules. Read the BIBLE first, then this, then
> `docs/ATLAS_ARCHITECTURE_VISION.md` and `docs/BACKLOG.md`.
>
> **Status:** M0 done (bar the in‑browser Google sign‑in + git remote). M1 done. **M2 (Proactive
> Engine) in progress** — design in `docs/PROACTIVE_ENGINE.md`.

---

## 0. Your role & operating contract

You are the **permanent Principal Engineer / acting CTO of Atlas** — a full‑stack engineer, AI systems
architect, and UX/UI lead in one. You own the codebase and its trajectory. The founder provides vision;
you turn it into a world‑class product.

**Autonomy.** You have standing permission to create/modify/move files, install packages, run terminal
commands, write migrations, refactor, and fix bugs without asking. Work in **large milestones**, not
micro‑steps. Report only when: (a) a milestone is complete, (b) an external credential/service is
required, (c) a true product‑vision fork needs the founder, or (d) a destructive/irreversible action is
proposed. Do not narrate small actions. Do not ask for approval to proceed between milestones.

**Stop exactly once at the start** to collect the credentials in §3 (you cannot proceed without them and
must never handle secrets yourself). After that, run continuously.

**Definition of "done" is in §7. The rules you must never break are in §8.** Everything you build is
measured against both.

---

## 1. What Atlas is (the vision — canonical)

Atlas is a **Life Operating System (LifeOS)**: an AI‑based personal assistant that knows the user
deeply, learns them over years, manages their time, knowledge, health and relationships, and
**proactively initiates** actions and recommendations so they live a more organised, balanced, and
meaningful life.

It is **not** a task manager, **not** a calendar, **not** an AI chat box. Those are table stakes it
happens to contain. The product is the *understanding* and the *initiative*.

**Three principles, in priority order:**
1. **Proactive over reactive.** Atlas initiates. It does not wait for commands. The user's job is to
   **approve or adjust** — never to operate a tool.
2. **Holistic integration.** Sleep affects focus; focus affects study and work; work pressure affects
   family time. Atlas connects these dots and plans across them, not per‑silo.
3. **Personal memory that compounds.** Every interaction makes Atlas more personal. It remembers how
   the user learns, when they focus, who lifts their mood, which habits work, when they procrastinate,
   what drives their success — and uses it.

**Language:** the entire UI, every piece of UX copy, every empty/error/loading state, and the AI's
conversational voice are in **fluent, natural, modern Israeli Hebrew**, with **perfect RTL**. No English
leaks into the user‑facing product.

### 1.1 Navigation — three layers

| Layer | Route(s) | Purpose |
|---|---|---|
| **Today** | `/` | The daily home. A live, AI‑curated view of *what matters right now* — reshaped by time of day, energy level, and urgency. Leads with synthesis, not raw lists. |
| **Areas** | `/areas/*` | The ten life domains (below). Each is a real workspace, not a data table. |
| **Timeline / AI** | `/timeline`, background | The memory + timeline engines running silently: AI Memory, Personal DNA, the Intelligence Engine, the Proactive Engine. |

### 1.2 The ten life areas

📅 Time & smart calendar · 📚 Studies & knowledge · ✡️ Torah (books, lessons, rabbis, sources,
summaries, questions) · 👨‍👩‍👧‍👦 Family & relationships · 🤝 Friends & social · 💼 Work & career · 💰
Finances · 🏃 Health & fitness · 📖 Reading & personal development · 🎨 Hobbies.

### 1.3 The modules (full scope — nothing here is optional to the vision)

1. **Google Auth + Deep Onboarding + Personal DNA.** Google OAuth; the app is **never hardcoded to a
   user** — it reads the connected Google identity and adapts everything to whoever is signed in.
   Onboarding is a **natural Hebrew conversation** (one question at a time, welcomes the user by their
   Google name), learning: family & friends, studies, career, goals & dreams, habits, sleep schedule,
   focus hours, hobbies, preferences. **Personal DNA Engine**: a background service that continuously
   refines best focus hours, learning style, motivation triggers, procrastination patterns, creative
   windows, work patterns — and feeds daily planning.
2. **Proactive AI + Smart Calendar.** Connected to Google Calendar. Scans real free windows; accounts
   for energy/focus (from DNA), location & travel time. Proactively suggests: create event, call a
   family member, schedule study, schedule a workout, take rest, reflow the schedule. The user sees
   **"אישור / שינוי"** (Approve / Modify) on every suggestion — nothing auto‑commits.
3. **Learning & Knowledge Hub.** Upload PDF, notebook photos, audio, documents, video. Atlas
   summarises, explains, generates **review questions + flashcards + mind‑maps**, connects new material
   to past material, tracks progress, and interfaces the outputs into daily tasks. Daily & weekly
   learning summaries.
4. **Torah Space.** A distinct, specialised environment. Categories: ספרים · שיעורים · רבנים · מקורות ·
   סיכומים · שאלות. Upload shiur audio → transcript, summary, explanation, review questions,
   **contextual links to previous shiurim**, building a personal Torah library over time.
5. **Family, Friends & Relationship CRM.** Profiles for meaningful people: birthdays, anniversaries,
   gifts given, interests, important dates, last‑contact date, relationship goals (e.g. a partner
   profile with goals). Proactively suggests: call, meet, buy a gift (based on their interests),
   schedule quality time. **Meeting Coordinator**: pick people → Atlas checks mutual availability (with
   permission) → proposes a time and a location → sends invites → syncs everyone's calendars.
6. **Health & Wellness.** Trackers: sleep, steps, hydration, workouts, mood, medical tests,
   medications. **Correlation engine** that actively surfaces findings — *"המיקוד שלך גבוה ב‑30% בימים
   שבהם ישנת 7 שעות ושתית מספיק מים."*
7. **Goals Engine.** Input a macro‑goal ("ללמוד מסכת חדשה", "לתכנן חתונה", a dev project) → Atlas builds
   a full timeline: sub‑plan, daily micro‑tasks, scheduled milestones, reviews, progress tracking,
   knowledge tests. Milestones land in the calendar.
8. **AI Memory + Life Timeline.** **AI Memory** — the central multi‑year engine (learning style, focus
   hours, mood‑lifting people, working habits, procrastination triggers, success drivers) powering all
   personalised recommendations. **Life Timeline** — a visual, scrollable, multi‑year timeline of
   studies, jobs, books, achievements, trips, family events, goals reached; shows trajectory, not just
   history.
9. **Day & Week Summaries.** **End of day:** what was learned, progress made, screen time, workouts,
   family time, completed tasks, "the good moment of today", what to improve tomorrow. **End of week:**
   charts, achievements, progress, habit consistency, quality time, health, learning — plus short
   **trivia questions generated from that week's learning** and recommendations for next week.
10. **Predictive AI Engine.** Runs in the background analysing patterns: anticipates busy weeks and
    pre‑clears recovery time; context‑aware morning guidance (*"היום ב‑16:00 יש לך חלון מיקוד חזק של
    שעתיים — הזמן האידיאלי להתקדם ב‑Next.js או ללמוד סוגיה"*); watches sleep/movement/learning continuity
    and proposes a proactive break or refresh when energy dips.
11. **Co‑Learning.** Atlas learns *with* the user: personalised test questions, mind‑maps, and
    flashcards from uploaded material that wire into daily tasks; multi‑year progress tracking that
    connects projects, masechtot, and financial goals into one trajectory view.
12. **Next‑gen interface.** A **live Today view** that visually updates with time of day, energy, and
    urgency. A **floating AI panel** taking free voice or text commands — *"היה לי יום עמוס, תעביר את מה
    שלא דחוף למחר ותפנה לי את הערב לחברים"* — and executing all the resulting calendar/task changes
    **on one approval**.
13. **Screen Time + real personal guidance.** Show screen‑time honestly (labelled for what a web app
    can actually measure), and pair it with an AI guidance surface that reflects **real, specific
    things Atlas has learned about this user** — not generic advice.
14. **Reminders & notifications.** Gentle, personal, well‑timed reminders (talk to a family member,
    review a shiur, a medical test is due, a milestone is slipping) delivered through real
    notification infrastructure, not just in‑app cards.

---

## 2. Ground truth — what already exists (verified against the code today)

**Do not trust older status notes that say "modules not started" or "Phase 1 blocked on Supabase."
Those are stale.** Here is the real state.

**Repo:** `~/Documents/Atlas` (flat — no more nested `Atlas/Atlas`). Branch `master`, HEAD `e68290a`,
75 commits, **no git remote**. Verified green on this machine today: `npm run lint` ✓ ·
`npm run typecheck` ✓ · `npm run test` → **251 passed** (38 files) ✓ · `npm run build` → **41/41**
pages ✓.

**Stack (installed & working):** Next.js 15.5 (App Router, Turbopack) · React 19 · TypeScript strict ·
Tailwind v4 (CSS‑first `@theme`, no config file, dark‑only, `dir="rtl"` + `lang="he"` hardcoded) ·
Zustand 5 (now a **client cache**, not the source of truth) · NextAuth v4 (Google OAuth, JWT sessions) ·
Supabase Postgres · Vercel AI SDK v7 (`ai` + `@ai-sdk/openai` + `@ai-sdk/google`) wrapped behind
`lib/ai/` · Vitest · GitHub Actions CI (`.github/workflows/ci.yml`: lint + typecheck + test + build).

**Foundation — done:**
- **Security:** every API route session‑checked; zod body validation (`lib/api/parseJsonBody.ts`);
  in‑memory rate limiting (`lib/api/rateLimit.ts`); Google token handled server‑side only via
  `getToken` (never on the client session); fail‑closed `ALLOWED_SIGNIN_EMAILS` allow‑list; refresh
  handling in `lib/auth.ts`.
- **Persistence (code complete):** 21 migrations `supabase/migrations/20260720000000_init.sql →
  20260727000000_chat_messages_pin.sql`. 27 tables: `users, personal_dna, personal_patterns,
  life_area_scores, moments, people, goals, milestones, tasks, habits, habit_logs, daily_intentions,
  insights, knowledge_entries, learning_topics, learning_resources, books, rabbis, summaries,
  health_logs, meals, workouts, transactions, manual_events, upcoming_events, chat_messages,
  recommendation_events`. 22 user‑scoped repositories in `lib/db/*` via
  `lib/db/createUserScopedRepo.ts`. 21 server‑action modules in `app/actions/*`. Tenant isolation =
  disciplined `user_id` filtering + service‑role key. RLS is **enabled but policy‑less by design**
  (documented in the init migration) — the isolation boundary is the repo layer, not RLS. Migration
  runner: `scripts/apply-migrations.mjs` (tracked in a `_migrations` table, idempotent). Verifier:
  `scripts/verify-phase1.mjs`.
- **Intelligence layer:** `lib/intelligence/core/` — the **Atlas Intelligence Engine**, a
  *deterministic, explainable* ranking pipeline (normalize → rank → detect conflicts → format), fixed
  0.5/0.3/0.2 importance/confidence/recency weights. `lib/intelligence/personalDNA/` — analyzers
  (focus, goals, learning, routine) + confidence model + timezone inference.
  `lib/intelligence/recommendations/` — dedupe, feedback weighting, tracking (`recommendation_events`).
  `lib/context/buildAtlasContext.ts` — assembles the per‑request context every AI call receives.
  `lib/memory/` — `rankRelevance`, `retrieveMemory`.
- **AI provider layer:** `lib/ai/` — OpenAI *or* Gemini selected by whichever key is set
  (`resolveChatProvider`); every AI route degrades to an **honest fallback** (never a fabricated
  answer) when no key is configured.

**Feature spaces — built (Phases 5–10, all live in the repo):**
- **`/` Today:** `AIBriefing` + `BriefingSignalList` (ranked signals from the Intelligence Engine),
  `LifeCompass` (5‑area score ring), `GoalsPanel`, `ScheduleSuggestions`, `EnergyLevelBadge`,
  `QuickCapture` (⌘K global moment capture), daily intention.
- **`/areas/time` Time & Tasks:** tasks, habits + habit logs, manual events; a merged **daily
  timeline** (`lib/time/buildDailyTimeline.ts` — tasks + events + shifts + meals + workouts); AI task
  suggestions (`/api/ai/suggest-tasks`) and prioritisation (`/api/ai/prioritize-tasks`); `DayCarousel`.
- **`/areas/finances`:** transactions, categories, work shifts/income, `NewTransactionModal`.
- **`/areas/learning`:** `learning_topics` + `learning_resources`; AI **Track Builder**
  (`lib/ai/learningPath.ts` + `/api/ai/learning-path`) turns a topic title into a starter curriculum.
- **`/areas/health`:** individual `meals` + `workouts` logging (merged into the daily timeline); AI
  **Nutrition Coach** (`/api/ai/nutrition`). `health_logs` table exists but is not yet wired to UI.
- **`/areas/torah` Torah Library:** `books`, `rabbis`, `summaries`; real shiur pipeline
  (`/api/torah/extract` — `unpdf` PDF text extraction + Whisper transcription + `generateObject`
  summary/questions), `AiSummaryModal`, `TorahTabs`, contextual links (`lib/torah/summaryLinks.ts`).
- **`/areas/family` Relationship CRM:** `people` with avatars/phone, full edit/delete, call/WhatsApp
  links, relationship health (`lib/family/deriveRelationshipHealth.ts`), suggested actions
  (`pickSuggestedAction`), meetup suggestion (`/api/family/meetup-suggestion` +
  `suggestMeetupLocationType`), `/api/family/insights`.
- **`/areas/career`:** thin — still the generic `AreaMomentsView`.
- **`/calendar`:** **real Google Calendar events** (`lib/googleCalendar/fetchEvents.ts`,
  `/api/calendar/{upcoming,week,events}`), grouped Today/Tomorrow/Upcoming
  (`lib/calendar/groupUpcomingEvents.ts`), free‑slot computation (`lib/calendarFreeSlots.ts`);
  `scheduledEvents` are injected into the AI context so the Companion can reason about the real
  schedule.
- **`/timeline`:** feed assembled from moments + goals + people + knowledge
  (`lib/timeline/buildTimelineEvents.ts`, `groupEvents.ts`).
- **AI Companion** (`components/layout/AICompanion.tsx`): streaming chat (`/api/chat` via `streamText`),
  pin messages, "based‑on" reasoning display, **chat → task conversion**, persisted to `chat_messages`.
- **Deep Onboarding** (`components/features/DeepOnboardingChat.tsx` + `/api/onboarding/message` +
  `lib/onboarding/deepOnboarding.ts`): conversational, one question at a time, patches `personal_dna`.
- **AI Command Panel** (`components/features/CommandPanel.tsx` + `/api/commands/interpret` +
  `lib/commands/*`): natural‑language → 5 structured intents (create task, schedule, clear calendar
  range, …).

**Docs in `/docs`:** `ATLAS_ARCHITECTURE_VISION.md` (the canonical architecture + build log, §1–§19 —
**read this**), `BACKLOG.md` (the living backlog — supersedes the audits), `ROADMAP_V2.md` (infra
phases 0–6). Historical/point‑in‑time (2026‑07‑20, pre‑persistence — treat as archive):
`PROJECT_ANALYSIS.md`, `ARCHITECTURE_AUDIT.md`, `TECH_DEBT.md`, `FEATURE_GAP_ANALYSIS.md`. Product
framing: `ATLAS_PRODUCT_STRATEGY.md`, `ATLAS_UX_SPEC.md`, `ATLAS_MVP_PRODUCT_SPEC.md`,
`ATLAS_TECHNICAL_PLAN.md`, `DEVELOPMENT_PROTOCOL.md`.

> **Doc reconciliation needed (Milestone 1).** `ATLAS_PRODUCT_STRATEGY.md` / `ATLAS_UX_SPEC.md` /
> `ATLAS_MVP_PRODUCT_SPEC.md` describe a *narrow* "reflection‑partner" MVP. The code, the
> `DEVELOPMENT_PROTOCOL.md`, and the `ATLAS_ARCHITECTURE_VISION.md` follow the *broad LifeOS*. **The
> founder has now decisively chosen the full LifeOS in §1 of this brief.** Reconcile the docs to that:
> produce `docs/ATLAS_BIBLE.md` as the consolidated source of truth and mark the narrow‑MVP docs as
> superseded.

---

## 3. The one allowed stop — credentials & housekeeping (do this first)

`.env.local` does **not** exist on this machine and was never synced. Ask the founder **once**, in a
single message, for the values below, then write `.env.local` yourself (never echo the secret values
back):

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | New project: `https://mvisahvtmdgidodgwkso.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | The **service_role** secret from Supabase → Settings → API. The code does **not** use `SUPABASE_SECRET_KEY` / publishable keys — map the service_role value here. |
| `SUPABASE_DB_URL` | Direct Postgres connection string (Settings → Database). Used only by `npm run db:migrate`. |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` — generate fresh (the old one leaked in past sessions). |
| `NEXTAUTH_URL` | `http://localhost:3000` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud Console → Credentials. **Rotate the secret.** OAuth consent scopes must include `calendar.events`. |
| `ALLOWED_SIGNIN_EMAILS` | `nesiel12388@gmail.com` |
| `OPENAI_API_KEY` and/or `GEMINI_API_KEY` | Either enables AI features. `OPENAI_API_KEY` is additionally required for Torah/Learning **audio transcription** (Whisper) regardless of chat provider. |

Then, autonomously:
1. `npm install` → `npm run lint && npm run typecheck && npm run test && npm run build` — confirm green.
2. `npm run db:migrate` against the new Supabase project. Then run `node scripts/verify-phase1.mjs`
   (CRUD + multi‑user isolation). Fix any schema drift; add migrations if the code expects columns the
   DB lacks.
3. **Create a private git remote and push.** There is currently no remote and this local repo is the
   only copy — a failed file sync already nearly destroyed months of work. Ask the founder for a GitHub
   repo URL (or use `gh repo create atlas --private --source=. --remote=origin --push`). Confirm CI
   runs.
4. **First real authenticated end‑to‑end walkthrough** (never been done): Google sign‑in → Deep
   Onboarding → capture data in several areas → **restart the browser, confirm everything persisted** →
   sign in as a second Google account and confirm it sees an empty, isolated dataset. Log every bug to
   `BACKLOG.md`; fix anything that blocks the core flow before moving on.

**Lost work to look for.** Uncommitted post‑Phase‑10 WIP only partially survived the machine move.
Fragments are in `~/Documents/Atlas_recovered_wip/` (a Voice Agent: `AtlasCoreOrb`, `AtlasVoiceAgent`,
`CommandMenu`; a timeline redesign: `NostalgiaCard`, `TimelineFeed`). **Fully lost** unless recovered
from macOS Trash / Time Machine / OneDrive web version history: an **Academy** feature (structured
courses — stages, exams, certification, trivia, video embeds), **Daily/Weekly Wrap‑up + Reminders Hub**
(`components/features/dailyWrapup/*`, `/api/reminders`), **Smart Calendar v2** (`twin-ai`,
`calendar/torah-info`, `/calendar/smart`), the **"Museum of Life" Timeline** redesign,
`LifeSimulatorModal`, `AtlasVisionInput`, `DnaOnboarding`, `AmbientLighting`. Check those backups
**before** rebuilding; otherwise these become roadmap items (they map cleanly onto Milestones 3, 9, 10,
12 below).

---

## 4. The honest gap — prototype depth vs. the vision

The scaffolding is strong; the *product* is shallow. Known gaps (see `BACKLOG.md` for the full list):

- **Nothing is proactive yet.** There is no scheduler/background job. Insights, briefings, reminders,
  and recommendation expiry all require the user to open the app. The single defining principle of
  Atlas is not implemented. → **Milestone 2.**
- **"Accept suggestion" is fake.** Accepting a calendar suggestion writes to a local table, **not** the
  user's real Google Calendar. → **Milestone 5.**
- **Personal DNA barely affects anything.** `peakFocusHours` / `learningStyle` are collected but only
  lightly touch a rationale string. They must drive scheduling, ranking, and the AI's tone. →
  **Milestones 2, 3, 5.**
- **Learning Hub is thin.** No real multi‑format upload → summary → flashcards → mind‑map → connect →
  progress pipeline. Only the topic Track Builder exists. → **Milestone 4.**
- **Chat memory is shallow.** `/api/chat` passes recent raw turns; no semantic retrieval of past
  moments/knowledge. → **Milestone 2/4.**
- **Health has no correlation engine.** Trackers for sleep/mood/tests/meds don't exist as UI; no
  "X correlates with Y" analysis. → **Milestone 6.**
- **No Day/Week summaries, no Life Timeline v2, no Friends CRM (distinct from Family), no Meeting
  Coordinator, no Screen‑Time guidance surface, no notifications.** → **Milestones 8–12.**
- **`gmail.readonly` scope is requested but unused** — build a feature or drop the scope.
- **No real browser/a11y/perf audit** has ever run against an authenticated session.

---

## 5. The build roadmap (work through these as autonomous milestones)

Read `docs/ATLAS_ARCHITECTURE_VISION.md` + `docs/BACKLOG.md` before each milestone. Each milestone ends
with: green lint/typecheck/test/build, a real authenticated verification, a `BACKLOG.md` update, and a
milestone commit.

- **M0 — Operational readiness.** §3 in full: env, migrations on the new DB, git remote + push, the
  first authenticated e2e walkthrough, fix core‑flow blockers.
- **M1 — Doc reconciliation & commitment to the full LifeOS.** Produce `docs/ATLAS_BIBLE.md`
  (consolidated vision + architecture + product principles + roadmap + "rules Claude must never
  break"). Supersede the narrow‑MVP docs. Align `ROADMAP_V2.md` and `BACKLOG.md` to this brief.
- **M2 — The Proactive Engine (highest priority — this is what makes Atlas *Atlas*).**
  - A real background job runner (Supabase scheduled functions or Vercel Cron) with a per‑user job
    ledger and idempotency.
  - Jobs: nightly **daily‑insight** generation; early‑morning **briefing** pre‑computation with
    DNA‑aware focus‑window guidance; **reminder sweep** (family contact overdue, shiur review due,
    milestone slipping, medical test due); **`recommendation_events` expiry sweep**; **busy‑week
    detection** → proactive recovery‑time suggestions.
  - **Notification infrastructure**: in‑app notification centre + transactional email (digest /
    reminder) at minimum; Web Push as a stretch. All notifications Hebrew, gentle, dismissible,
    per‑user configurable.
  - Feed `personal_dna` (focus hours, learning style, procrastination pattern) into the Intelligence
    Engine ranking and the chat system prompt so onboarding answers visibly change behaviour.
  - Semantic memory retrieval for chat (embeddings over `moments` + `knowledge_entries` +
    `summaries`), replacing raw‑turn context.
- **M3 — Today View v3 + the floating AI panel.**
  - Today visually reshapes by time of day, current energy, and urgency — leads with one synthesised
    "here's your day" statement, then ranked cards.
  - The floating panel accepts **free text and voice** (Web Speech API, Hebrew) and executes
    multi‑step plans ("move non‑urgent to tomorrow, clear my evening for friends") as a single
    reviewable diff the user approves once. Reuse `/api/commands/interpret`; extend to compound plans.
- **M4 — Learning & Knowledge Hub (real).** Multi‑format upload (PDF, image/OCR, audio, video
  transcript, doc) → summary + explanation + **review questions + flashcards + mind‑map** + links to
  prior material + progress tracking; flashcard review scheduling that surfaces in the daily timeline;
  daily & weekly learning recaps.
- **M5 — Calendar Intelligence.** "Accept" writes the real Google Calendar event. Energy/focus/
  travel‑time‑aware auto‑scheduling of study/workout/rest into real free windows. Automatic task
  reflow when the day slips. **Meeting Coordinator** (mutual free time → location → invites → sync).
- **M6 — Health depth + correlation engine.** Sleep, steps, hydration, mood, medical tests,
  medications trackers (wire `health_logs`). A correlation analyzer that surfaces honest, evidenced
  findings on Today and the weekly dashboard.
- **M7 — Goals Engine v2.** Macro‑goal → full plan + milestones + **daily micro‑tasks scheduled into
  the calendar** + review checkpoints + knowledge tests + progress + trajectory view.
- **M8 — Screen Time + Personal Guidance.** Honest measurement, clearly labelled. A guidance surface
  where the AI speaks from **specific learned facts** about this user ("שמתי לב שבשבועיים האחרונים
  הלמידה נעצרת אחרי 21:00 — נסה חלון בוקר").
- **M9 — Day & Week Summaries.** Auto end‑of‑day recap (learned, progress, screen time, family time,
  completed tasks, best moment, tomorrow). End‑of‑week dashboard (charts, achievements, habit
  consistency, health, learning) + **trivia generated from the week's learning** + next‑week
  recommendations.
- **M10 — Life Timeline v2 ("Museum of Life").** A visual, scrollable, multi‑year timeline —
  studies, jobs, books, achievements, trips, family events, goals reached — showing trajectory.
- **M11 — Friends CRM + Torah / Family deepening.** A Friends area distinct from Family; richer Torah
  library (sources, questions, cross‑shiur graph); relationship‑goal tracking.
- **M12 — SaaS surface.** Account settings (profile, revoke Google access, delete account), data
  export (JSON), privacy policy + ToS (also required to get Google OAuth out of "testing"), PWA
  manifest + offline shell, notification preferences, and — as a deliberate, greenlit decision —
  opening sign‑up beyond the allow‑list with real RLS policies.

---

## 6. Data & architecture direction

- Keep the **deterministic, explainable** Intelligence Engine. No black‑box ranking. No autonomous
  agent that acts without an explicit user Approve/Modify. Every recommendation carries its "על סמך…"
  attribution and is reversible.
- Extend the schema by **migration only** (`supabase/migrations/`, timestamped, idempotent). New
  domains follow the existing pattern: table + `createUserScopedRepo` repo + `app/actions` module +
  `types/database.ts` entry.
- New background work goes through the **job ledger** (M2), never ad‑hoc `setTimeout`.
- `personal_patterns` + `personal_dna` are the memory substrate — every new feature should ask "what
  should Atlas remember from this, and how does it change future recommendations?"
- Zustand stays a **client cache** over server‑fetched data. Server Components / server actions for
  reads where possible; optimistic client updates for writes.
- Prefer adding to `lib/ai/` (one shared module, multiple callers) over inline AI calls when a second
  caller appears.

---

## 7. Definition of Done (every feature, every milestone)

A feature is done only when **all** of the following hold:
1. **Works end‑to‑end against the real Supabase DB** for the signed‑in Google user; data persists
   across reload; strictly isolated per user.
2. **Hebrew + RTL correct** everywhere — labels, buttons, AI copy, errors, empty & loading states.
   Natural modern Israeli Hebrew, not translated‑English.
3. **All four states designed:** populated, empty (quiet, honest — never a fake "all caught up!"),
   loading (skeleton, not raw spinner), error (actionable Hebrew message). No dead ends.
4. **Visually consistent:** built from `GlassCard` / `Modal` / existing accent tokens / spacing scale.
   Mobile‑first responsive. Calm Framer Motion (150–300ms, spring for surfaces), honoring
   `prefers-reduced-motion`.
5. **AI paths:** real when a key is set, **honest fallback** when not; session‑checked; zod‑validated;
   rate‑limited. Never fabricate.
6. **Proactive where the vision calls for it** — if the feature produces something the user should be
   told about, it goes through the Proactive/Notification engine, not just an in‑app card.
7. **Tested:** pure logic has Vitest unit tests; `npm run lint && npm run typecheck && npm run test &&
   npm run build` all green.
8. **Documented:** `BACKLOG.md` updated (close what's done, file what's discovered); `ATLAS_BIBLE.md`
   updated if architecture/product direction changed; milestone commit with a clear message.
9. **Verified by a real authenticated click‑through** — not just tests. Note what you checked.

---

## 8. Rules Claude must never break

1. **Hebrew‑first, RTL‑perfect.** No English in the user‑facing product. Ever.
2. **Per‑user isolation.** Every read/write is scoped to the authenticated user id. Never trust
   client‑side filtering. Never expose the Google token or any secret to the client.
3. **The AI never lies.** No fabricated responses when a provider is unavailable — degrade honestly.
   Every recommendation is reversible and attributable.
4. **Approve/Modify, always.** Atlas proposes; the user disposes. No irreversible action fires without
   explicit user confirmation. No silent auto‑commit to the calendar, to contacts, or to anyone else's
   calendar.
5. **Determinism & explainability** in the intelligence/ranking layer. No opaque scoring. No
   autonomous multi‑step agent acting unattended.
6. **Preserve working systems.** Phases 5–10 ship value — improve them incrementally, don't rewrite
   them. Understand why code exists before changing it.
7. **Green or revert.** Never commit with lint/typecheck/test/build failing.
8. **Migrations only** for schema change — no manual DB edits, no destructive migration without
   explicit founder approval.
9. **Don't hardcode the user.** Everything derives from the live Google identity.
10. **Stop only for:** external credentials/services, a real product‑vision fork, or a
    destructive/irreversible action. Everything else — decide and continue.
11. **Report in milestones**, not micro‑updates. Respect the founder's time and the token budget.
12. **Accessibility is not optional:** focus‑visible indicators, `prefers-reduced-motion`, ≥44px touch
    targets, real `<label>`s (not placeholder‑as‑label), a skip‑to‑content link.

---

## 9. Start here

1. Read this file, then `docs/ATLAS_ARCHITECTURE_VISION.md`, `docs/BACKLOG.md`, `docs/ROADMAP_V2.md`.
   Run `git log --oneline -20`.
2. `npm install` → `npm run lint && npm run typecheck && npm run test && npm run build`. Confirm green.
3. Ask the founder — once — for the §3 credentials and a private GitHub repo URL. Write `.env.local`.
4. Run migrations on the new Supabase project; verify with `scripts/verify-phase1.mjs`.
5. Add the git remote and push; confirm CI passes.
6. Do the first authenticated end‑to‑end walkthrough; fix core‑flow blockers; log the rest.
7. Then run continuously: **M1 (doc reconciliation) → M2 (Proactive Engine) → onward**, reporting only
   at milestone boundaries.

Build the version of Atlas described in §1. Not a lesser one.
