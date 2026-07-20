# Atlas — Engineering Backlog

This is the living, continuously-maintained list of everything known to need doing that isn't part of the *current* roadmap phase's objectives. `docs/ARCHITECTURE_AUDIT.md`, `docs/TECH_DEBT.md`, and `docs/FEATURE_GAP_ANALYSIS.md` are the point-in-time audit that started this process — they stay as-written, a historical snapshot. This document supersedes them going forward as the place new findings get filed and old ones get closed.

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
- **Form inputs rely on `placeholder` as their only label** across `QuickCapture`, `OnboardingFlow`, `GoalsPanel`, and the dashboard intention textarea — a known accessibility anti-pattern.
- **Rate-limit thresholds are unvalidated guesses** (20/10/10 per 5 min) — reasonable defaults, not tuned against real usage. Revisit once there's real traffic to look at.
- **Test coverage is currently just the pure-logic core.** Vitest + CI (lint/typecheck/test on every PR) are live (`.github/workflows/ci.yml`), covering `lib/utils.ts`'s date math and the calendar route's `computeFreeSlots`. Still open: integration tests for the API routes (auth-required, validation-rejects-bad-input, mock-fallback-when-no-key), component tests, and error tracking/structured logging — the rest of Phase 5's exit criterion.
- **Torah Space extraction's AI-summarized path is untested against `OPENAI_API_KEY` being live** (it's currently blank — see `docs/PROJECT_ANALYSIS.md`). The pipeline (`app/api/torah/extract`) genuinely extracts PDF text (`unpdf`) and transcribes audio (Whisper) now instead of returning fixed fake content, and was smoke-tested standalone: real PDF text extraction confirmed working, and the `generateObject` summarization call confirmed reachable (fails only on the placeholder empty key, as expected). The honest-fallback path (no key → real extracted text/snippet instead of an AI summary) is what actually runs today. Revisit once a real key is set.
- **`personalDNA` still doesn't influence calendar-suggestion ranking.** `peakFocusHours`/`learningStyle`/`habitNotes` now shape the chat system prompt (`lib/chatSystemPrompt.ts`), and `familyCheckInIntervalDays` now drives the family page's stale-contact threshold instead of a hardcoded 7 — but `/api/calendar/suggestions` still ranks purely by weakest life-area score. `peakFocusHours` is free text from onboarding (not structured hours), so using it to filter/prefer time slots would need either a parsing step or folding scheduling through an LLM call — deliberately not done yet to avoid guessing at a data shape the user never actually committed to. *Files: `app/api/calendar/suggestions/route.ts`.*

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

- Real memory/RAG layer for chat: retrieve relevant past moments/knowledge entries instead of only passing recent raw turns.
- A genuine unprompted "background AI" behavior — a scheduled job generating the daily insight, rather than the one hand-seeded example that exists today.
- Voice input for Quick Capture and Torah Space.
- Native mobile app, if usage data ever justifies it.
- Billing/plans — only once there's an actual reason to charge, not built speculatively.
- Multi-device presence/sync indicators.
