# Atlas — Architecture Audit

**Read this after `PROJECT_ANALYSIS.md`.** That document says what exists; this one judges whether it's the right foundation for a production, multi-user, AI-native product. Verdicts assume the stated ambition — "production-grade AI-native Life Operating System" — not the ambition of a weekend prototype, which is what this codebase currently architecturally is, regardless of how polished its UI looks.

Overall grade: **prototype-quality UI shell over no backend.** The frontend engineering (component composition, RTL handling, Tailwind discipline) is genuinely good. Everything below the frontend — persistence, multi-tenancy, security boundary, observability — does not exist yet. That's not a tweak away from production; it's the majority of the remaining work.

---

## 1. State management: client-only Zustand as system of record

**Verdict: Wrong architecture for a product with the word "Operating System" in its name.**

Right now, Zustand isn't a cache or a UI-state layer — it *is* the database. That has consequences that compound:

- **Data loss is the default behavior.** A phone lock, a browser crash, a tab close, a deploy — any of these wipes the user's Torah log, family notes, goals, and chat history back to the hardcoded fixtures. For a "life reflection" product, this is not a rough edge, it's disqualifying.
- **No multi-device story.** Nothing syncs between a phone and a laptop because nothing leaves the browser tab that wrote it.
- **No multi-user story.** The store has exactly one `user` object, hardcoded. Every person who successfully authenticates via Google sees and can mutate the same "Nesiel" data (see §4).
- **Every page that reads the store must be a Client Component**, because Zustand's `create()` hook only works client-side. That's why every route in `app/` except the three thin `/areas/*` wrappers is `"use client"`. This forfeits React Server Components entirely: no server-side data fetching, no streaming, larger client JS bundles, and a slower first paint than a Next.js 15 App Router app should have. The framework choice (App Router, React 19) is architecturally at odds with the state choice (client-only Zustand).

This is the single most important finding in this audit. Everything else is downstream of it or independent of it.

## 2. Persistence layer: doesn't exist

`lib/supabase.ts` is `export {}`. There is no schema, no migration tooling, no query layer, nothing. The product name "Atlas" and the phrase "Supabase/Store" in project instructions imply Supabase was always the intended backend, but zero of that intention has been executed. Treat the current `useAtlasStore` as a **UI prototype of the eventual data model**, not as infrastructure to build on top of — the shapes are a reasonable starting point for a schema, but the storage mechanism needs to be replaced, not extended.

## 3. Authentication vs. authorization: only half-built

Authentication (proving *who* someone is) is real and correctly implemented: NextAuth + Google OAuth, JWT session, token persisted through callbacks. Good.

Authorization (deciding *what* they can see/do once identified) does not exist:

- No `signIn` callback restricting the allowed Google account(s). Any Google account that completes the OAuth consent screen gets a valid Atlas session today.
- Once authenticated, session identity and application data are **completely disconnected**. `useAtlasStore`'s `user` object, `people`, `moments`, `goals` — none of it is keyed by `session.user.email` or any user ID. The dashboard *displays* the session's name/avatar (a cosmetic read), but every mutation writes into the one shared global store. Two different Google accounts signing in from two different browsers would both be reading/writing the same in-memory data model shape, and if this were ever backed by a shared server (it isn't yet, but that's the trajectory), they'd collide on the same rows.
- This means the "multi-tenant" question hasn't been designed at all yet — not "implemented poorly," but genuinely not decided. Is Atlas one person's app forever, or a product other people will sign up for? The current code assumes the former (hardcoded `nesiel12388@gmail.com` bio) while the auth *infrastructure* (OAuth, scopes) assumes the latter. That mismatch needs a decision, not just code.

## 4. Sensitive-scope access token handling

`lib/auth.ts`'s `session` callback puts `token.accessToken` onto the **client-visible** session object (`session.accessToken = ...`). That access token carries `calendar.readonly` and `gmail.readonly` scopes. Once it's on the client session, it round-trips through `useSession()` into browser JS on every page that calls it — currently nowhere does, but the surface exists, and any future XSS or a careless `console.log` turns into a real account-access leak, not just a session-cookie leak. Sensitive OAuth tokens like this belong **server-side only** (fetched fresh via `getServerSession` inside API routes, as `/api/calendar/suggestions` already correctly does) and should never be added to the object returned to the client.

## 5. API route security: two of three routes are open to the internet

`/api/chat` and `/api/goals/breakdown` have no session check. `middleware.ts`'s matcher only covers page routes (`/`, `/timeline/:path*`, `/areas/:path*`) — API routes were never included. Right now this "only" burns mock-fallback compute because `OPENAI_API_KEY` is blank, but the moment a real key is set, these become **unauthenticated, unrate-limited pass-throughs to a paid LLM API**, reachable by anyone who finds the URL. This is a direct cost-abuse vector, not a theoretical one.

`/api/calendar/suggestions` does the right thing (`getServerSession` check before doing anything), which shows the team knows the pattern — it just wasn't applied consistently.

None of the three routes validate their request bodies against a schema. All three do `(await request.json()) as SomeInterface` — a compile-time cast with zero runtime enforcement. `zod` is already a dependency (pulled in transitively by the `ai` SDK); it is not used anywhere for its actual purpose.

## 6. Rendering & data-fetching strategy

The App Router's core value — server rendering, streaming, Suspense boundaries, `loading.tsx`/`error.tsx` conventions — is essentially unused. Every data-bearing page is a client component reading synchronous in-memory state, so there is nothing to suspend on and nothing to stream. This is consistent with §1 (client-only store forces this), but it's worth naming as its own architectural cost: **Atlas is currently a client-rendered SPA wearing a Next.js App Router costume.** That's fine for a prototype; it is not what "production-grade" App Router usage looks like, and it will need to change in lockstep with the persistence migration (server-fetched data → Server Components → client hydration only where interactivity is needed).

## 7. Component architecture

The good parts, genuinely: `GlassCard` as a shared visual primitive, `AreaMomentsView` as a parameterized shared view for 3 of the 5 area pages, consistent Framer Motion usage, a real RTL/Hebrew foundation (`dir="rtl"`, `.ltr` escape hatch, Heebo font with Hebrew subset) that most teams get wrong on the first pass.

The gaps: there is no shared **modal/overlay primitive**. `AICompanion`, `QuickCapture`, and `OnboardingFlow` each hand-roll their own `fixed` + backdrop + `AnimatePresence` + close-on-Escape/backdrop-click scaffolding independently, with subtly different z-index layers (50, 60, 70 — clearly reasoned about individually, not from a shared stacking-context contract). There is no shared **data-fetch hook** — `AICompanion.handleSend`, `ScheduleSuggestions`'s mount effect, and `GoalsPanel.handleCreateGoal` each reimplement fetch/loading/error state by hand, inconsistently (see `TECH_DEBT.md` for the specific bug this produced). There is no shared **life-area metadata registry** — the mapping from `LifeAreaKey` to a Hebrew label and a color lives independently in `store/useAtlasStore.ts` (`categoryLabel`), `components/features/QuickCapture.tsx` (`CATEGORIES`), `app/areas/page.tsx` (`AREA_META`), `app/timeline/page.tsx` (`CATEGORY_COLOR`), and `app/api/calendar/suggestions/route.ts` (`ACTION_BY_CATEGORY`) — five independent sources of truth for the same five facts, only one of which (icons, in `AREA_META`) has information the others lack. `components/features/` is also becoming a flat grab-bag with no sub-grouping (goals, calendar, onboarding, capture, and a chart component all sit as siblings) — fine at 6 files, not fine at 30.

## 8. Folder structure & module boundaries

Reasonable at current scale (`app/`, `components/{ui,layout,features,providers}`, `lib/`, `store/`, `types/`). It will not survive the addition of a real backend without restructuring: there's no `server/` or `db/` boundary, no per-domain grouping (a "Goals" feature today touches `types/index.ts`, `store/useAtlasStore.ts`, `components/features/GoalsPanel.tsx`, and `app/api/goals/breakdown/route.ts` — four files in four different top-level folders, with nothing enforcing they stay in sync). This is normal and acceptable for a 6-week prototype. It's called out here because "production-grade" implies this will need to become domain-oriented (e.g., `features/goals/{types,store-slice,api,components}`) before the codebase triples in size, not after.

## 9. Observability & error handling

None. No logging library, no error tracking (Sentry or equivalent), no structured request logs in API routes. Every `catch` block in the codebase (`AICompanion`, `ScheduleSuggestions`, all three API routes) silently swallows the error and falls back to a canned response — reasonable as a *user-facing* fallback, but there is currently no way for anyone operating this system to know a failure happened at all. A production incident today would be invisible until a user complains.

## 10. Testing & CI

Zero automated tests of any kind (no unit, integration, or e2e test files; no test runner installed). No CI configuration (no `.github/workflows`, no equivalent). No git repository at all as of this snapshot — meaning there is currently no code review process, no rollback mechanism, and no history, which is a prerequisite for CI to even be meaningful. This is covered in depth in `TECH_DEBT.md` and sequenced first in `ROADMAP_V2.md` because almost nothing else on this list can be done safely without it.

## 11. What's actually good and should survive the rewrite

Worth stating plainly so nothing here reads as "throw it all away": the Tailwind v4 theming approach (`@theme inline` + CSS custom properties for the accent palette) is clean and should carry forward unchanged. The RTL/Hebrew foundation is correct and non-trivial to get right — keep it. `GlassCard` and `AreaMomentsView` are the right shape for reusable components once real data arrives; they just need a real data source underneath. The NextAuth + Google OAuth wiring is correctly built for what it covers (§3–4 are gaps in *scope*, not in the quality of what was implemented). The AI-with-graceful-mock-fallback pattern in `/api/chat` and `/api/goals/breakdown` is a good pattern to keep once auth/validation are added on top of it.
