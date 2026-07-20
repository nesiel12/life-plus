# Atlas — Roadmap to V2

This sequences the findings in `ARCHITECTURE_AUDIT.md`, `TECH_DEBT.md`, and `FEATURE_GAP_ANALYSIS.md` into phases. Ordering follows dependency, not excitement — persistence and security come before new AI features because every future feature will otherwise be built twice (once on the fake store, again on the real one). Each phase lists a goal, concrete deliverables, and an exit criterion — a test of "are we actually done," not a vibe.

No phase below should start until this document and the three it summarizes have been reviewed. Per the current instruction, no implementation work begins until then.

---

## Phase 0 — Foundational hygiene
*Goal: stop the bleeding. Everything here is cheap and nearly risk-free, and blocks doing anything else safely.*

- Initialize git, commit the current state as-is, push to a real remote.
- Rotate `NEXTAUTH_SECRET` and `GOOGLE_CLIENT_SECRET` (both have appeared in plaintext across this working session; rotating costs minutes and removes the question mark permanently).
- Add a `signIn` callback in `lib/auth.ts` restricting authentication to an explicit allow-list (starting with one email) until real multi-tenancy exists.
- Replace `README.md` with real setup instructions (stack, env vars required, how to run).
- Fail fast on missing required env vars at boot instead of silently defaulting to `""`.

**Exit criterion:** `git log` has history, secrets are rotated and only the new values exist anywhere, and a new engineer can clone the repo and run it from `README.md` alone.

---

## Phase 1 — Real persistence & data ownership
*Goal: replace "Zustand as database" with an actual database. This is the largest phase and the one everything else depends on.*

- Stand up Supabase (or equivalent Postgres) and design a real schema from the shapes already validated in `types/index.ts` — those interfaces are a good starting draft, not a rewrite.
- Add Row Level Security so a user can only ever read/write their own rows — this is what actually solves the multi-tenancy gap, not just the allow-list from Phase 0.
- Decide deliberately (not by default) whether Atlas is single-user-forever or multi-user-from-day-one, and design the schema accordingly — this is a product decision, not just an engineering one, and it changes the shape of every table.
- Migrate `useAtlasStore` from *source of truth* to *client cache*: reads become server-fetched (Server Components where possible) or client-fetched-and-cached, writes become mutations against the database with optimistic local updates.
- Backfill the current hardcoded fixture data as the seed for one real user row, then delete the fixtures from the store file.

**Exit criterion:** closing the browser and reopening it shows the same data. Two different Google accounts see two different, isolated datasets.

---

## Phase 2 — Security hardening
*Goal: close every gap in `TECH_DEBT.md`'s 🔴/🟠 rows that Phase 1 doesn't already fix as a side effect.*

- Bring `/api/chat` and `/api/goals/breakdown` behind the same session check `/api/calendar/suggestions` already does.
- Add basic rate limiting to all three AI-backed routes (per-user, not just per-IP, now that Phase 1 provides a real user identity to key on).
- Move `session.accessToken` off the client-visible session object; fetch it server-side only, inside the API routes that need it.
- Implement Google refresh-token storage and rotation so calendar suggestions don't silently die after an hour.
- Add zod schemas for every API route's request body and validate before touching the payload.
- Revisit the Phase-0 allow-list once real multi-tenancy (Phase 1) and Google OAuth app verification are both in place, and open sign-up accordingly.

**Exit criterion:** an unauthenticated request to any `/api/*` route returns 401, every API input is schema-validated, and no sensitive token is ever visible in browser devtools.

---

## Phase 3 — Architecture consolidation
*Goal: pay down the DRY/consistency debt from `TECH_DEBT.md` §Medium before the codebase grows past the point where consolidation is cheap.*

- Extract one shared overlay/modal primitive; migrate `AICompanion`, `QuickCapture`, and `OnboardingFlow` onto it with one coherent z-index scale.
- Extract a single life-area metadata registry (label, color, icon, slug) and delete the five independent copies.
- Extract a shared moment-card component and a shared `useApiCall`-style hook (loading/error/data) and migrate the three hand-rolled fetch call sites onto it — this also fixes the silent-failure bug in `GoalsPanel`.
- Fix the non-memoized Zustand selectors flagged in `TECH_DEBT.md` #15.
- Reorganize `components/features/` into per-domain folders (`features/goals/`, `features/calendar/`, `features/torah/`, `features/family/`) now that Phase 1's server layer gives each domain a natural matching API/query module to sit next to.

**Exit criterion:** adding a 6th life area requires editing one file, not five. No component reimplements fetch-loading-error state by hand.

---

## Phase 4 — Make the AI actually central
*Goal: close the gaps in `FEATURE_GAP_ANALYSIS.md` where the UI implies AI is doing something it isn't.*

- Torah Space: replace the mocked `setTimeout` extraction with a real pipeline (transcription for audio, text extraction for PDF, then an actual summarization/topic-extraction call) — this is the single biggest "looks done, isn't" gap in the product.
- Calendar: make "accept suggestion" actually create the event in the user's Google Calendar via the Calendar API, not just locally.
- Give `personalDNA` an actual effect on the system — feed `peakFocusHours`/`learningStyle` into the calendar-suggestion ranking and the chat system prompt, so onboarding answers visibly change behavior.
- Add a real memory layer for chat: retrieve relevant past `moments`/`knowledgeEntries` (semantic search, once Phase 1's database supports it) instead of only passing recent raw chat turns.
- Build the first real "background," unprompted AI behavior — a scheduled job (not user-triggered) that generates the daily `insights` entry, rather than the one hand-seeded example that exists today.
- Decide what to do with the `gmail.readonly` scope: either build the feature it implies or drop the scope. Don't ship a permission with no feature behind it.

**Exit criterion:** uploading two different files to Torah Space produces two different summaries. Accepting a calendar suggestion is visible in the user's actual Google Calendar app.

---

## Phase 5 — Testing, CI/CD, observability
*Goal: make it possible to change Atlas without fear, and to know when something breaks in production before a user reports it.*

- Add a test runner (Vitest is the natural fit given the stack) with unit coverage on the pure logic first: `lib/utils.ts` date math, the free-slot computation in `/api/calendar/suggestions`, the store's action reducers.
- Add integration tests for the API routes (auth-required, validation-rejects-bad-input, mock-fallback-when-no-key).
- Stand up CI (GitHub Actions or equivalent) running lint, typecheck, and tests on every PR — this is also the point at which Phase 0's git history starts paying for itself.
- Add error tracking (Sentry or equivalent) and structured logging in every API route, replacing the current silent `catch` blocks.
- Add basic usage/cost dashboards for the AI-backed routes now that they're authenticated and rate-limited.

**Exit criterion:** a broken PR fails CI before merge. A production error shows up in a dashboard within minutes, not only when a user complains.

---

## Phase 6 — SaaS surface
*Goal: close the gaps that separate "an app one person uses" from "a product other people can sign up for," if and when that's the actual goal — this phase should be explicitly greenlit, not assumed.*

- Account settings page: edit profile fields, view/revoke connected Google access, delete account.
- Data export (a plain JSON/PDF download of everything Atlas holds about the user).
- Notification infrastructure: transactional email at minimum (digest, reminder), push notifications as a stretch.
- Search across moments, chat history, and Torah sessions.
- Privacy policy + terms of service — also a hard requirement for Google to move the OAuth consent screen out of "unverified/testing" mode.
- PWA manifest + offline-friendly shell; native mobile only if usage data justifies it later.
- Billing integration only once there's a reason to charge — don't build Stripe scaffolding speculatively.

**Exit criterion:** a second real person, unrelated to the original user, can sign up, use Atlas for a week, and export or delete their data without any engineer intervening by hand.

---

## Sequencing notes

Phases 0–2 are not optional and not reorderable relative to each other — persistence before consolidation, security in the same breath as persistence (a real database with no auth checks is worse than the current all-mock state, not better). Phase 3 can partially overlap Phase 4 once Phase 1 lands, since consolidation and new-feature work touch mostly-disjoint files. Phase 5 should start no later than Phase 3 in parallel, not after everything else — retrofitting tests onto a codebase that tripled in size without them is far more expensive than growing them alongside. Phase 6 is explicitly gated on a product decision (is Atlas a SaaS other people join, or a personal system built for one person) that this document does not make on anyone's behalf.
