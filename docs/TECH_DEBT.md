# Atlas — Technical Debt Register

Every item below is verified against the actual current code (file + line), not inferred. Severity is about *production consequence*, not effort. Effort is a rough T-shirt size for a single engineer. This register should be kept up to date — delete rows as they're fixed, add rows as new debt is knowingly taken on.

Legend — Severity: 🔴 Critical (blocks production/multi-user use) · 🟠 High (security or data-integrity risk) · 🟡 Medium (correctness, maintainability, perf) · 🟢 Low (polish, hygiene).

---

## 🔴 Critical

| # | Item | Location | Why it matters | Effort |
|---|---|---|---|---|
| 1 | No persistence layer at all | `lib/supabase.ts` (empty), `store/useAtlasStore.ts` (whole file) | Every user's data — moments, goals, family notes, chat history — is lost on refresh, tab close, or crash. This is the load-bearing gap; almost everything else is downstream of it. | XL |
| 2 | No version control | project root (`git status` → not a repository) | No commit history, no rollback, no code review, no CI is possible without this. Should be the literal first action taken, before any other fix in this register. | XS |
| 3 | Application data not scoped to authenticated identity | `store/useAtlasStore.ts:169-173` (`user` hardcoded to Nesiel regardless of `session`) | Every signed-in Google account reads/writes the same shared dataset. There is no per-user data model yet, only a per-user *display name* read from the session as a cosmetic overlay. | L |
| 4 | Two of three API routes are unauthenticated | `app/api/chat/route.ts`, `app/api/goals/breakdown/route.ts` | Both call a real paid LLM API once `OPENAI_API_KEY` is set, with no session check and no rate limit. `middleware.ts`'s matcher never included `/api/*`. Direct cost-abuse exposure the moment a real key is configured. | S |

## 🟠 High (security)

| # | Item | Location | Why it matters | Effort |
|---|---|---|---|---|
| 5 | Sensitive OAuth access token exposed to client JS | `lib/auth.ts:37-40` (`session.accessToken = token.accessToken`) | The Google token carries `calendar.readonly` + `gmail.readonly` scopes and is placed on the object `useSession()` returns in the browser. Should be fetched server-side only via `getServerSession`, as `/api/calendar/suggestions` already correctly does — don't also put it on the client session. | S |
| 6 | No `signIn` allow-list | `lib/auth.ts` (no `callbacks.signIn`) | Any Google account that completes OAuth consent gets a valid session today. Fine while unlisted/unverified; becomes a real problem the moment this is deployed anywhere reachable. | XS |
| 7 | No request-body validation on any API route | `app/api/chat/route.ts:25`, `app/api/goals/breakdown/route.ts:32`, `app/api/calendar/suggestions/route.ts:61` | All three do `(await request.json()) as SomeInterface` — a compile-time-only cast. Malformed or malicious bodies aren't rejected, they're just silently mis-typed at runtime. `zod` is already a dependency (pulled in transitively) and is unused for its actual purpose. | S |
| 8 | Google credentials silently default to empty string | `lib/auth.ts:15-16` | `process.env.GOOGLE_CLIENT_ID ?? ""` — if the env var is missing, the app boots "successfully" and fails opaquely at the OAuth handshake instead of failing fast at startup with a clear error. | XS |
| 9 | Real secrets have round-tripped through plaintext session context | `.env.local` | `NEXTAUTH_SECRET` and `GOOGLE_CLIENT_SECRET` are real, live values that have been pasted into this working session multiple times. They are correctly gitignored, but should be rotated before any production deployment as standard hygiene, and future secret handling should avoid pasting real values into any chat/log surface at all. | XS (rotate) |

## 🟡 Medium (correctness, DRY, performance)

| # | Item | Location | Why it matters | Effort |
|---|---|---|---|---|
| 10 | Silent failure on goal creation network error | `components/features/GoalsPanel.tsx:23-39` | `handleCreateGoal` has no `catch` around its `fetch`. If the request fails (offline, 500, etc.), `finally` still clears the loading state, but nothing is shown to the user and no goal is created — it just silently does nothing. A real, reproducible bug, not a hypothetical. | XS |
| 11 | Life-area metadata duplicated across 5 files | `store/useAtlasStore.ts:305-315` (`categoryLabel`), `components/features/QuickCapture.tsx:9-15` (`CATEGORIES`), `app/areas/page.tsx:10-16` (`AREA_META`), `app/timeline/page.tsx:7-14` (`CATEGORY_COLOR`), `app/api/calendar/suggestions/route.ts:8-15` (`ACTION_BY_CATEGORY`) | Five independent sources of truth for "what is this life area called / colored / iconified." Adding a 6th life area means editing 5 files and hoping none are missed. | S |
| 12 | Modal/overlay scaffolding hand-rolled 3 times | `components/layout/AICompanion.tsx`, `components/features/QuickCapture.tsx`, `components/features/OnboardingFlow.tsx` | Each independently implements its own `fixed` positioning, backdrop, `AnimatePresence`, and dismiss logic, with inconsistent z-index values (50 / 60 / 70) reasoned about in isolation rather than from one stacking-context contract. | M |
| 13 | Fetch/loading/error pattern hand-rolled 3 times, inconsistently | `AICompanion.handleSend`, `ScheduleSuggestions`'s mount effect, `GoalsPanel.handleCreateGoal` | Three different ad-hoc implementations of "call an API, track loading, handle failure" with three different failure behaviors (one shows a chat error message, one shows a "not connected" state, one shows nothing — see #10). | S |
| 14 | Duplicated moment-card rendering + date formatting | `app/timeline/page.tsx:30-51` vs. `components/features/AreaMomentsView.tsx:70-89` | Near-identical `motion.li` markup and an identical `toLocaleDateString("he-IL", { day: "numeric", month: "short" })` call, copy-pasted rather than shared. | XS |
| 15 | Non-memoized Zustand selectors creating new arrays every render | `components/features/AreaMomentsView.tsx:17` (`s.moments.filter(...)` inline in the selector) | Every render of every mounted area page produces a brand-new array reference, so Zustand's reference-equality check can't skip re-renders even when nothing relevant changed — any store mutation anywhere touching `moments` re-renders every area view. | S |
| 16 | Stale-closure `useEffect` with `eslint-disable` | `components/features/ScheduleSuggestions.tsx:41` | The mount-only effect captures `lifeAreas` at first render; if scores change later without an unmount/remount, suggestions won't reflect updated scores until the page is revisited. The lint rule was suppressed rather than the dependency addressed. | XS |
| 17 | No pagination anywhere lists are rendered | `app/timeline/page.tsx`, `components/features/AreaMomentsView.tsx` | Every `moments`/`goals`/`people` list renders its full array unconditionally. Fine at fixture-data scale (a handful of items); will not scale once real usage accumulates months of entries. | M |

## 🟢 Low (polish, hygiene)

| # | Item | Location | Why it matters | Effort |
|---|---|---|---|---|
| 18 | `README.md` is unedited `create-next-app` boilerplate | `README.md` | Doesn't mention Atlas, the stack choices, env setup, or how to run it. First thing any new collaborator would open. | XS |
| 19 | Seed/fixture data lives inside the store logic file | `store/useAtlasStore.ts:57-166` | `initialLifeAreas`, `initialPeople`, etc. are mixed into the same file as the store's actions, making the file long and conflating "starting data" with "state logic." Should live in a separate fixtures module (and eventually be deleted entirely once real persistence lands). | XS |
| 20 | No `loading.tsx` / `error.tsx` / `not-found.tsx` anywhere | `app/` | None of the App Router's built-in loading/error UX conventions are used, so failures render as the default Next.js error overlay rather than an on-brand state. | S |
| 21 | Form inputs rely on `placeholder` as their only label | `QuickCapture.tsx`, `OnboardingFlow.tsx`, `GoalsPanel.tsx`, dashboard intention textarea | Placeholder-as-label is a known accessibility anti-pattern (disappears on focus, not reliably read by all screen readers). No `<label>`/`aria-label` pairing on most text inputs. | S |
| 22 | Dark-only theme, `color-scheme: dark` forced | `app/globals.css:35` | Deliberate design choice, not a bug — flagged only so it's a recorded decision (users with OS-level "light mode" preference get no adaptation, and browser chrome is forced dark too) rather than an oversight discovered later. | — (decision, not debt) |

---

## Explicitly not counted as debt

No test suite and no CI are **not** listed as line items here — they're structural absences, not localized fixes, and are addressed as their own phase in `ROADMAP_V2.md` rather than as a register entry.
