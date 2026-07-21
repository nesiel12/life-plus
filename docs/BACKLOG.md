# Atlas — Engineering Backlog

This is the living, continuously-maintained list of everything known to need doing that isn't part of the *current* roadmap phase's objectives. `docs/ARCHITECTURE_AUDIT.md`, `docs/TECH_DEBT.md`, and `docs/FEATURE_GAP_ANALYSIS.md` are the point-in-time audit that started this process — they stay as-written, a historical snapshot. This document supersedes them going forward as the place new findings get filed and old ones get closed. `docs/ATLAS_ARCHITECTURE_VISION.md` is the long-term target architecture this backlog's items get checked against — read it for *why* something here is sequenced the way it is.

**Rule:** discovering something while working on a phase does not interrupt the phase unless it makes the app unstable, insecure, or fundamentally incorrect *right now*. Otherwise, it gets a row here and gets picked up when its priority comes due.

Each entry: what it is, why it's at that priority, where it lives, and what it depends on (if anything). Closed items are removed, not struck through — git history is the record of what used to be here.

---

## Critical
*Threatens security, data integrity, scalability, or production readiness.*

*(none open)*

## High Priority
*Architectural improvements that should land before any real user besides the current one touches this.*

- **RLS policies are fail-closed placeholders, not active protection for the current access path.** Every table has RLS enabled with zero policies, which blocks the anon/authenticated keys entirely — but the app talks to Postgres via the service-role key, which bypasses RLS by design. The actual tenant-isolation boundary today is disciplined `user_id` filtering in `lib/db/*.ts` (verified live — see `scripts/verify-phase1.mjs`), not RLS. This is documented in the migration file; flagged here so it doesn't get mistaken for protection it doesn't provide if a future feature ever queries Supabase directly from the client. *Files: `supabase/migrations/20260720000000_init.sql`.*
- **In-memory rate limiter won't survive horizontal scaling.** `lib/api/rateLimit.ts` is correct for a single process; needs a shared store (Redis/Upstash) before Atlas ever runs more than one instance. *Files: `lib/api/rateLimit.ts`.*
- **Full end-to-end verification still pending a real browser session.** Phase 1's CRUD/isolation checks were run directly against the database (`scripts/verify-phase1.mjs`) since a real Google sign-in can't be driven from here — that proves the data layer is correct, but the actual click-through (sign in → hydrate → mutate → see it persist) hasn't been observed in a live browser yet.

## Medium Priority
*Quality, refactors, UX consistency, maintainability.*

- **No pagination anywhere a list renders** (`moments`, `goals`, `people`). Fine at current usage levels, won't scale indefinitely.
- **Rate-limit thresholds are unvalidated guesses** (20/10/10 per 5 min) — reasonable defaults, not tuned against real usage. Revisit once there's real traffic to look at.
- **Test coverage is strong on pure logic, absent on DB-touching orchestration.** Vitest + CI (lint/typecheck/test on every PR) are live (`.github/workflows/ci.yml`), covering date math, `calendarFreeSlots`, `rankRelevance`, `formatContext`, the chat/context prompt builders, every Personal DNA analyzer + confidence model, and — as of Recommendation Intelligence v1 — feedback weighting, status-transition validity, and outcome summarization (85 tests total). Still genuinely untested: `buildAtlasContext`, `analyzePersonalDNA`, `personalPatternsRepo`, and now `recommendationEventsRepo`/`createRecommendationEvent`/`recordRecommendationOutcome` — all thin DB-composition layers with no automated coverage, blocked on the same "no integration-test harness yet" gap. Also open: integration tests for the API routes themselves, component tests, error tracking/structured logging.
- **Torah Space extraction's AI-summarized path is untested against `OPENAI_API_KEY` being live** (it's currently blank — see `docs/PROJECT_ANALYSIS.md`). The pipeline (`app/api/torah/extract`) genuinely extracts PDF text (`unpdf`) and transcribes audio (Whisper) now instead of returning fixed fake content, and was smoke-tested standalone: real PDF text extraction confirmed working, and the `generateObject` summarization call confirmed reachable (fails only on the placeholder empty key, as expected). The honest-fallback path (no key → real extracted text/snippet instead of an AI summary) is what actually runs today. Revisit once a real key is set.
- **Calendar suggestions still doesn't rank by focus window.** A confident inferred `peakActivityWindow` pattern (Personal DNA Engine v1, `docs/ATLAS_ARCHITECTURE_VISION.md` §3) now enriches a matching suggestion's *rationale* text, but the ranking itself (which life area / which slot gets suggested) is unchanged — deliberately scoped as "foundation only" this milestone. The stated (not inferred) `peakFocusHours` field remains unused entirely, same reasoning as before: free text, not structured hours. *Files: `app/api/calendar/suggestions/route.ts`.*
- **Torah page's client-side `findRelatedSessions` now duplicates server-side memory retrieval.** `app/areas/torah/page.tsx`'s keyword-overlap matcher against the *returned* topic and the server's `relevantMemory` (via Context Engine, used *during* summarization) do similar jobs from two different angles — one shows "related past sessions" in the UI, the other actually informs the AI's summary. Not urgent (both are honest, neither is broken), but worth reconciling into one mechanism once the UI-facing "related sessions" list is revisited. *Files: `app/areas/torah/page.tsx`, `app/api/torah/extract/route.ts`.*
- **`milestoneCompletionPace` (Personal DNA) has no evidence yet.** It only populates from milestones completed *after* migration `20260720000003` added `completed_at` — anything marked done before that has no timestamp, deliberately left `null` rather than backfilled with a guess. Will start producing a pattern once ~3 milestones are completed going forward. Not a bug, just a cold-start gap worth knowing about if it looks "missing." *Files: `lib/intelligence/personalDNA/analyzers/goals.ts`.*
- **Recommendation feedback doesn't adjust Personal DNA confidence yet.** `recommendation_events` now exists and is written to (calendar suggestions, goal breakdown) and read from (`getRecommendationInsights` → `AtlasContext.recommendationInsights` → chat), but `calculateFeedbackConfidenceAdjustment`'s output never reaches `resolvePatternUpdate` — the two confidence mechanisms are deliberately decoupled per this milestone's "clean interfaces, no tight coupling" scope. Real future value, gated on enough accept/reject volume to design the coupling deliberately rather than guessing at its shape now. *Files: `lib/intelligence/recommendations/feedback.ts`, `lib/intelligence/personalDNA/confidence.ts`.*
- **No active `expired` sweep for stale `recommendation_events`.** The status is fully modeled (feedback weight, valid-transition rule) but nothing marks a long-`pending` suggestion `expired` — needs a scheduled job, which doesn't exist yet (see Future Vision below). Suggestions that sit unanswered currently just stay `pending` forever rather than eventually contributing their (weak, per design) negative signal.
- **Calendar suggestion ranking doesn't consult recommendation feedback.** Same "foundation, not rebuild" scope as the Personal DNA calendar integration above — `recommendationInsights` reaches chat's context but not the suggestions route's own ranking logic. *Files: `app/api/calendar/suggestions/route.ts`.*

## Low Priority
*Minor polish, cleanup, optimization.*

- **`README.md` needs a real rewrite** — still close to `create-next-app` boilerplate despite the project having moved far past that, and now needs the Supabase setup steps (env vars, `npm run db:migrate`) documented too.
- **Dark-only theme, `color-scheme: dark` forced.** Recorded as a deliberate decision, not a defect — listed for visibility, not action.
- **Bundle size** (~199KB shared First Load JS) is on the higher side for a "calm, fast" app. Not a problem yet; worth watching as more features land, especially once real Server Component data-fetching (Phase 1 follow-through) can claw some of it back.

## Nice to Have
*Would improve the product; not currently required.*

- Search across moments, chat history, and Torah/knowledge entries.
- Data export (JSON/PDF) of everything Atlas holds about a user — also increasingly a baseline expectation once real personal data is stored server-side.
- Account settings page: edit profile fields, view/revoke connected Google access, delete account.
- PWA manifest + offline-friendly shell.

## Future Vision
*Large ideas, experimental features, long-term concepts.*

- A genuine unprompted "background AI" behavior — a scheduled job generating the daily insight, rather than the one hand-seeded example that exists today. Also the natural home for a `recommendation_events` `expired` sweep once it exists.
- **Advanced recommendation ranking** — once real accept/reject volume exists, feed `calculateFeedbackConfidenceAdjustment`'s signal into calendar-suggestion ranking itself (not just rationale text) and into Personal DNA's `resolvePatternUpdate`. Deliberately not built in Recommendation Intelligence v1 — see `docs/ATLAS_ARCHITECTURE_VISION.md` §7's "deliberately not built this session."
- **Predictive recommendation engine** — Atlas proactively surfacing a suggestion before the user opens the relevant surface (e.g. a calendar suggestion pushed as a notification, not just computed on page load), once real notification infrastructure and enough recommendation-outcome history exist to predict rather than just react. Explicitly out of scope until both prerequisites are real — see "Avoid: agent systems, complex automation engines" in the same architecture-doc section.
- Voice input for Quick Capture and Torah Space.
- Native mobile app, if usage data ever justifies it.
- Billing/plans — only once there's an actual reason to charge, not built speculatively.
- Multi-device presence/sync indicators.
