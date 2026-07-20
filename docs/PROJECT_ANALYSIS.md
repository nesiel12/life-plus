# Atlas — Project Analysis (V0 Snapshot)

**Purpose of this document:** a factual, complete inventory of what exists in the codebase today. No opinions, no criticism — that's `ARCHITECTURE_AUDIT.md` and `TECH_DEBT.md`. This document exists so that every later judgment call is traceable to something real, and so a new engineer can get oriented in one read.

Snapshot date: 2026-07-20. Stack: Next.js 15.5.20 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS v4, Zustand 5, NextAuth (Auth.js) v4.24, Vercel AI SDK v7 (`ai` + `@ai-sdk/openai`), Framer Motion, lucide-react.

---

## 1. High-level shape

Atlas is a single-tenant, Hebrew/RTL, client-rendered personal life dashboard. There is **no database** — `lib/supabase.ts` is an empty placeholder (`export {}`), and all application data lives in one in-memory Zustand store that is seeded with hardcoded fixture data at module load and reset on every full page reload. Authentication is real (Google OAuth via NextAuth), but authorization and data are not connected to the authenticated identity at all — every signed-in user sees the same hardcoded "Nesiel" dataset.

Three architectural layers exist, per the product's own stated model:
- **Today** (`/`) — daily dashboard.
- **Areas** (`/areas` and `/areas/[torah|family|health|career|learning]`) — the five life domains.
- **Background AI** — no dedicated route; expressed as a floating "AI Companion" orb present on every authenticated page, plus two API-backed AI features (goal breakdown, calendar suggestions).

A fourth, cross-cutting page — **Timeline** (`/timeline`) — shows a reverse-chronological feed of all "Moments" regardless of area.

---

## 2. Routes (`app/`)

| Route | File | Type | Auth |
|---|---|---|---|
| `/` | `app/page.tsx` | Client Component | Protected (middleware) |
| `/areas` | `app/areas/page.tsx` | Client Component | Protected |
| `/areas/torah` | `app/areas/torah/page.tsx` | Client Component | Protected |
| `/areas/family` | `app/areas/family/page.tsx` | Client Component | Protected |
| `/areas/health` | `app/areas/health/page.tsx` | Server Component (thin wrapper) | Protected |
| `/areas/career` | `app/areas/career/page.tsx` | Server Component (thin wrapper) | Protected |
| `/areas/learning` | `app/areas/learning/page.tsx` | Server Component (thin wrapper) | Protected |
| `/timeline` | `app/timeline/page.tsx` | Client Component | Protected |
| `/login` | `app/login/page.tsx` | Client Component | Public |
| `/api/auth/[...nextauth]` | route.ts | NextAuth handler | Public (by necessity) |
| `/api/chat` | route.ts | POST handler | **Unprotected** |
| `/api/goals/breakdown` | route.ts | POST handler | **Unprotected** |
| `/api/calendar/suggestions` | route.ts | POST handler | Session-checked internally |

`app/layout.tsx` is the root layout: wraps everything in `AuthProvider` (NextAuth `SessionProvider`) → `AppShell`. `app/template.tsx` provides a fade/slide transition on every route change (App Router `template.tsx` convention — remounts per navigation).

There are no `loading.tsx`, `error.tsx`, or `not-found.tsx` files anywhere in the route tree.

---

## 3. Middleware (`middleware.ts`)

Uses `next-auth/middleware`'s `withAuth` with a custom `pages.signIn: "/login"`. Matcher: `["/", "/timeline/:path*", "/areas/:path*"]`. This is the **only** enforcement point for authentication in the entire app — it protects pages, not API routes (API routes are not in the matcher).

---

## 4. Authentication (`lib/auth.ts`, `types/next-auth.d.ts`)

NextAuth v4, JWT session strategy (default — no `session.strategy` override, no adapter, so no database-backed sessions). Single provider: Google OAuth, requesting `openid profile email calendar.readonly gmail.readonly` with `access_type: "offline"` and `prompt: "consent"`. Custom `jwt` and `session` callbacks copy `account.access_token` onto the JWT and then onto the client-visible `session.accessToken`. `types/next-auth.d.ts` augments the `Session` and `JWT` types accordingly.

No `signIn` callback restricting which Google accounts may authenticate — any Google account that completes OAuth consent gets a valid session.

---

## 5. State (`store/useAtlasStore.ts`)

One Zustand store (no `persist` middleware, no slicing/`combine`, no devtools middleware), holding:

- `user: UserContext` — hardcoded name/email/bio, unrelated to the NextAuth session.
- `lifeAreas: LifeArea[]` — the 5 domains with a 0–100 `score`.
- `people: Person[]` — 8 hardcoded family members.
- `moments: Moment[]`, `upcomingEvents: UpcomingEvent[]`, `knowledgeEntries: KnowledgeEntry[]`, `chatHistory: ChatMessage[]`, `insights: Insight[]`.
- `todayIntention: string`.
- `personalDNA: PersonalDNA` — onboarding-collected traits.
- `onboardingComplete: boolean`.
- `goals: Goal[]`, `suggestedActions: SuggestedAction[]`.

18 action creators mutate this state via `set()`. `categoryLabel()` is also exported from this file as a free function (a Hebrew label lookup for `MomentCategory`).

All seed data (`initialLifeAreas`, `initialPeople`, `initialMoments`, `initialUpcomingEvents`, `initialKnowledgeEntries`) is defined as module-level constants in the same file as the store logic.

---

## 6. Types (`types/index.ts`, `types/next-auth.d.ts`)

Thirteen interfaces/types: `LifeAreaKey`, `LifeArea`, `Person`, `MomentCategory`, `Moment`, `ChatRole`, `ChatMessage`, `Insight`, `UserContext`, `KnowledgeEntry`, `UpcomingEvent`, `PersonalDNA`, `OnboardingQuestion`, `Milestone`, `Goal`, `FreeSlot`, `SuggestedAction`. All dates are stored as ISO strings, not `Date` objects. No runtime schema (no zod schemas mirroring these types, despite `zod` being a project dependency).

---

## 7. Components

### `components/ui/` — generic primitives
- `Logo.tsx` — inline SVG mark, gradient ring + sphere, no props beyond `size`/`className`.
- `GlassCard.tsx` — the one shared visual primitive: a `motion.div` with the `glass-card` CSS class, fade/slide-in on mount, `delay` prop for stagger.

### `components/layout/`
- `AppShell.tsx` — client component gating `NavBar` / `AICompanion` / `QuickCapture` / `OnboardingFlow` behind a `pathname !== "/login"` check.
- `NavBar.tsx` — sticky header: logo, 3 nav links (Today/Areas/Timeline), session avatar + sign-out button.
- `AICompanion.tsx` — floating orb (bottom-right) that opens a chat panel ("Reflection Space") backed by `/api/chat`.

### `components/providers/`
- `AuthProvider.tsx` — thin `SessionProvider` wrapper.

### `components/features/`
- `QuickCapture.tsx` — global ⌘K/Ctrl+K modal for logging a `Moment` into any life area.
- `LifeCompass.tsx` — SVG concentric-ring visualization of the 5 `lifeAreas` scores, used only on the Today dashboard.
- `AreaMomentsView.tsx` — shared presentational component for the Health/Career/Learning area pages: score bar + quick-add + moment history, parameterized by `areaKey`.
- `OnboardingFlow.tsx` — full-screen one-question-at-a-time modal shown when `!onboardingComplete`, writes answers into `personalDNA`.
- `ScheduleSuggestions.tsx` — fetches `/api/calendar/suggestions` on mount, renders accept/dismiss cards.
- `GoalsPanel.tsx` — goal creation form (calls `/api/goals/breakdown`) + goal/milestone checklist, rendered on the Today dashboard.

Torah Space (`app/areas/torah/page.tsx`) and Family Care (`app/areas/family/page.tsx`) are **not** extracted into `components/features/` — their markup lives directly in the page file.

---

## 8. API routes (`app/api/`)

- **`POST /api/chat`** — takes `{ message, history }`, calls `generateText` (OpenAI `gpt-4o-mini`) with a hardcoded system prompt describing "Nesiel," falls back to a canned Hebrew mock reply if `OPENAI_API_KEY` is unset or the call throws. No auth check, no rate limit, no input length cap.
- **`POST /api/goals/breakdown`** — takes `{ title, category }`, same AI-with-mock-fallback pattern, returns a parsed milestone list. No auth check.
- **`POST /api/calendar/suggestions`** — takes `{ lifeAreas }`, reads the session server-side via `getServerSession(authOptions)`, and if an `accessToken` is present calls Google's real `freeBusy` API, computes free gaps, and maps the 3 lowest-scoring life areas onto them. Returns `{ connected: false, suggestions: [] }` gracefully if there's no token.

---

## 9. Library code (`lib/`)

- `auth.ts` — NextAuth config (see §4).
- `constants.ts` — `APP_NAME`, `APP_TAGLINE`, `ONBOARDING_QUESTIONS`.
- `supabase.ts` — empty (`export {}`); no client, no schema, no queries.
- `utils.ts` — `cn()` (clsx + tailwind-merge), `daysUntil`, `daysSince`, `daysUntilNextBirthday`.

No `hooks/` content exists beyond a placeholder `.gitkeep`; no custom hooks have been extracted anywhere in the app.

---

## 10. Styling (`app/globals.css`)

Tailwind v4 CSS-first config (`@theme inline`, no `tailwind.config.js`). Dark-only palette (`color-scheme: dark` forced), 5 CSS custom properties for the life-area accent colors, one `.glass-card` utility class, one `.ltr` escape-hatch class for embedding LTR content inside the RTL document. `html` has `dir="rtl"` hardcoded; `lang="he"` hardcoded in `app/layout.tsx`.

---

## 11. Configuration

- `next.config.ts` — only `images.remotePatterns` for `lh3.googleusercontent.com` (Google avatars).
- `tsconfig.json` — `strict: true`, target `ES2017`, path alias `@/*` → project root.
- `eslint.config.mjs` — Next.js default flat config (`next/core-web-vitals`, `next/typescript`).
- `.env.local` (gitignored) — `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OPENAI_API_KEY` (currently blank).
- `.env.example` — the same keys, blank, committed as the template.
- No `tailwind.config.js` (intentional — v4 uses CSS-first config).
- No `vitest.config`, `jest.config`, `playwright.config`, or any test runner configuration.
- No CI workflow files (no `.github/workflows`).
- **Not a git repository** — `git status` at the project root returns "not a git repository." There is no version control at all as of this snapshot.

---

## 12. Dependencies of note

Production: `next`, `react`/`react-dom` 19, `next-auth` 4.24.14, `ai` 7.0.31, `@ai-sdk/openai` 4.0.16, `zustand` 5, `framer-motion` 12, `lucide-react`, `zod` 4, `clsx`, `tailwind-merge`.
No: `@supabase/supabase-js`, no ORM, no testing library, no `@types/*` beyond React/Node, no logging/observability SDK, no rate-limiting library, no form library, no i18n library (Hebrew is hardcoded everywhere, not extracted into a translation layer).

---

## 13. What is real vs. mocked, precisely

| Feature | Status |
|---|---|
| Google sign-in | Real |
| Google Calendar free/busy read | Real (requires valid, unexpired access token) |
| Chat replies | Real if `OPENAI_API_KEY` set, else deterministic mock |
| Goal milestone breakdown | Real if `OPENAI_API_KEY` set, else deterministic template |
| Torah shiur upload → summary | **Fully mocked** — `setTimeout` + hardcoded fake extraction result, regardless of the uploaded file's actual content |
| Gmail read access | **Requested (OAuth scope) but never used anywhere in the code** |
| "Accept" a calendar suggestion | Writes to local Zustand `upcomingEvents` only — **does not create anything in the user's actual Google Calendar** |
| Data persistence across reload | **None** — everything resets to the hardcoded fixtures |
| Multi-user support | **None** — one shared hardcoded identity for every authenticated session |
