# Atlas — Engineering Backlog

This is the living, continuously-maintained list of everything known to need doing that isn't part of the *current* roadmap phase's objectives. `docs/ARCHITECTURE_AUDIT.md`, `docs/TECH_DEBT.md`, and `docs/FEATURE_GAP_ANALYSIS.md` are the point-in-time audit that started this process — they stay as-written, a historical snapshot. This document supersedes them going forward as the place new findings get filed and old ones get closed.

**Rule:** discovering something while working on a phase does not interrupt the phase unless it makes the app unstable, insecure, or fundamentally incorrect *right now*. Otherwise, it gets a row here and gets picked up when its priority comes due.

Each entry: what it is, why it's at that priority, where it lives, and what it depends on (if anything).

---

## Critical
*Threatens security, data integrity, scalability, or production readiness.*

- **No live database connection yet.** The schema and data-access layer exist (`supabase/migrations/`, `lib/db/`) but nothing has run against a real Postgres instance — the app still reads/writes only the in-memory Zustand store. Blocked on a live Supabase project's credentials. *Depends on: user creating a Supabase project.*
- **`/api/chat` and `/api/goals/breakdown` have no session check.** Both call a real paid LLM API once `OPENAI_API_KEY` is set, reachable by anyone who finds the URL. *In progress — Phase 2a.*
- **No request-body validation on any API route.** All three routes do a compile-time-only `as SomeInterface` cast on `request.json()`. `zod` is a dependency and unused for its actual purpose. *In progress — Phase 2b.*
- **`session.accessToken` is exposed to client JS.** The Google token (carrying `calendar.readonly` + `gmail.readonly`) is on the object `useSession()` returns in the browser. *In progress — Phase 2c.*

## High Priority
*Architectural improvements that should land before any real user besides the current one touches this.*

- **RLS policies are fail-closed placeholders, not active protection for the current access path.** Every table has RLS enabled with zero policies, which blocks the anon/authenticated keys entirely — but the app talks to Postgres via the service-role key, which bypasses RLS by design. The actual tenant-isolation boundary today is disciplined `user_id` filtering in `lib/db/*.ts`, not RLS. This is documented in the migration file; flagged here so it doesn't get mistaken for protection it doesn't provide if a future feature ever queries Supabase directly from the client. *Files: `supabase/migrations/20260720000000_init.sql`.*
- **Google access token is never refreshed.** Expires per Google's standard token lifetime; calendar suggestions silently stop working after. *In progress — Phase 2c.*
- **Torah Space file upload is fully mocked.** `handleFileSelected` ignores the uploaded file's actual content and returns an identical hardcoded summary every time. This is the single biggest gap between how a feature looks finished and how not-started it is. *Files: `app/areas/torah/page.tsx`. Depends on: a real transcription/summarization pipeline — Phase 4 territory.*
- **"Accept" a calendar suggestion doesn't write to the user's actual Google Calendar.** It only appends to local state. *Files: `components/features/ScheduleSuggestions.tsx`, `store/useAtlasStore.ts` (`acceptSuggestion`). Depends on: Phase 1 completing (need somewhere durable to reconcile against) before this is worth doing properly.*
- **`gmail.readonly` scope requested, never used anywhere.** Either build the feature it implies or drop the scope — asking for unused access is a trust and OAuth-verification liability. *Files: `lib/auth.ts`.*
- **No tests, no CI.** Not a line item — its own roadmap phase (Phase 5). Listed here only so it isn't forgotten between now and then.

## Medium Priority
*Quality, refactors, UX consistency, maintainability.*

- **`GoalsPanel.handleCreateGoal` has no `catch` around its `fetch`.** A network failure clears the loading state and does nothing else — no error shown, no goal created, no signal to the user. *Files: `components/features/GoalsPanel.tsx:23-39`.*
- **Modal/overlay scaffolding hand-rolled three times** (`AICompanion`, `QuickCapture`, `OnboardingFlow`), each with its own z-index (50/60/70) reasoned about independently rather than from one stacking contract.
- **Fetch/loading/error pattern hand-rolled three times, inconsistently** — three different failure behaviors for the same shape of problem.
- **Non-memoized Zustand selector creates a new array every render.** `AreaMomentsView`'s `s.moments.filter(...)` inline in the selector means every mounted area page re-renders on any store mutation touching `moments`, not just relevant ones. *Files: `components/features/AreaMomentsView.tsx:17`.*
- **Stale-closure `useEffect` with a suppressed lint rule.** Captures `lifeAreas` at mount only; scores changing later won't refresh suggestions without a remount. *Files: `components/features/ScheduleSuggestions.tsx:41`.*
- **`personalDNA` is collected at onboarding and then never read anywhere.** `peakFocusHours`/`learningStyle` don't influence chat tone or scheduling yet — onboarding currently produces data with no effect. *Files: `store/useAtlasStore.ts`, `components/features/OnboardingFlow.tsx`. Natural fit for Phase 4 ("make the AI actually central").*
- **No pagination anywhere a list renders** (`moments`, `goals`, `people`). Fine at fixture-data scale, won't scale with real usage.
- **No `loading.tsx` / `error.tsx` / `not-found.tsx` anywhere in `app/`.** Failures fall through to the default Next.js overlay instead of an on-brand state.
- **Form inputs rely on `placeholder` as their only label** across `QuickCapture`, `OnboardingFlow`, `GoalsPanel`, and the dashboard intention textarea — a known accessibility anti-pattern.
- **Life-area metadata duplication — fixed.** Was: independently duplicated across 4 files. Now: `lib/lifeAreas.ts` is the single source. *(Closed 2026-07-20, kept here struck-through-in-spirit as a reference for the pattern to watch for elsewhere.)*

## Low Priority
*Minor polish, cleanup, optimization.*

- **`README.md` needs a real rewrite** — still close to `create-next-app` boilerplate despite the project having moved far past that. Worth doing once Phase 1's setup steps (Supabase env vars, migration command) are stable, so the README doesn't need a second rewrite immediately after.
- **Seed/fixture data lives inside `store/useAtlasStore.ts`** rather than a separate fixtures module. Low cost now; should simply be deleted (not relocated) once Phase 1's persistence migration replaces the store's fixtures with real data.
- **Dark-only theme, `color-scheme: dark` forced.** Recorded as a deliberate decision, not a defect — listed for visibility, not action.
- **Bundle size** (~200KB shared First Load JS) is on the higher side for a "calm, fast" app. Not a problem yet; worth watching as more features land, especially once real Server Component data-fetching (Phase 1 follow-through) can claw some of it back.

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
