# Atlas Technical Plan

Builds on ATLAS_PRODUCT_STRATEGY.md, ATLAS_MVP_PRODUCT_SPEC.md, and ATLAS_UX_SPEC.md. Optimized for one person, a small budget, and a working v1 in weeks, not quarters — while not painting the company into a corner technically.

## 1. Recommended Technology Stack and Why

- **Frontend:** Next.js (React) + TypeScript + Tailwind CSS. Single codebase serves web and can be wrapped for mobile later (via Capacitor or a React Native rewrite once there's real usage justifying it). Tailwind keeps the restrained, custom visual language from the UX spec achievable without a design system team.
- **Backend/DB/Auth:** Supabase (managed Postgres + built-in auth + storage + row-level security). This is the single highest-leverage decision in this plan: it removes the need to build or operate a custom backend, auth system, or database admin layer as a solo founder, while still giving you a real relational database you own and can migrate off later if needed.
- **AI layer:** Anthropic Claude API (via a thin server-side service, not called from the client) for reflection generation and voice-entry transcription post-processing. Use a dedicated small serverless function or API route — not embedded logic in the frontend — so prompt logic, context assembly, and guardrails live in one controllable place.
- **Voice-to-text:** A managed transcription API (e.g., Whisper via API) rather than building custom speech infrastructure.
- **Hosting:** Vercel for the Next.js app (zero-ops deploys, generous free/low tier), Supabase's own hosting for the database. This pairing is close to zero DevOps burden, which matters enormously for a solo founder's time budget.
- **Email:** A transactional email provider (e.g., Resend or Postmark) for weekly reflection delivery — cheap, reliable, minimal setup.

Why this stack overall: every piece is managed, has a generous free tier, and is a well-worn combination with abundant documentation — the goal is spending founder time on the reflection logic and UX, not on infrastructure plumbing.

## 2. Frontend Architecture

A single Next.js application with three logical areas: **public** (marketing/landing, minimal for MVP), **app** (the authenticated product — Timeline, Capture, Reflection, Entry Detail, Settings), and **api routes** (thin server-side endpoints that talk to Supabase and the Claude API, keeping secrets and prompt logic off the client). Use server components/server actions for data fetching where possible to avoid building a separate API layer. State management stays simple — React Query (or equivalent) for server state, no heavyweight global state library needed at this scale. Mobile-first responsive layout per the UX spec, built once and tested primarily on phone viewport widths before desktop.

## 3. Backend Architecture

At MVP scale, "backend" is mostly Supabase plus a small number of serverless functions, not a standalone service. Three responsibilities need dedicated server-side logic: (1) a capture endpoint that stores entries and kicks off transcription for voice notes, (2) a scheduled job (Supabase cron or a Vercel cron job) that runs weekly, gathers each active user's entries and profile, calls the Claude API to generate a reflection, and stores the result, and (3) an email-send step that notifies the user when a reflection is ready. No microservices, no message queue, no Kubernetes — a monolith-with-a-few-functions is the right size for this stage, and prematurely distributing it would cost far more founder time than it saves.

## 4. Database Design (High Level)

Mirrors the entities defined in ATLAS_MVP_PRODUCT_SPEC.md, expressed as tables:

- **users** — managed largely by Supabase Auth, extended with a profile table for subscription status
- **onboarding_profiles** — one row per user, storing seed-reflection answers as structured fields (goals, struggles, self-questions)
- **entries** — user_id, content, content_type (text/voice), transcription (if voice), created_at, inferred_theme (nullable, AI-generated, not user-set)
- **reflections** — user_id, generated_text, period_start, period_end, created_at
- **reflection_entry_links** — join table mapping reflections to the entries that informed them
- **capture_reminder_settings** — user_id, reminder frequency/channel preferences

Use Postgres row-level security (native to Supabase) so every table's access policy enforces "a user can only ever read their own rows" at the database level, not just in application code — this matters enormously given the sensitivity of the data and is close to free to set up in Supabase.

## 5. Authentication Approach

Use Supabase Auth directly rather than building custom auth: email/password plus one social login option (Google) to reduce signup friction. Avoid building magic-link-only or passwordless-only flows for v1 — keep it standard and boring, since auth is not where Atlas's differentiation lives and any custom-built auth is pure risk with no upside at this stage. Session handling via Supabase's built-in JWT/cookie approach integrated with Next.js middleware for route protection.

## 6. AI Reflection Pipeline (Concept)

Conceptually, once a week (or on-demand at day 7 for the first cycle), a scheduled job runs per active user: pull the onboarding profile, all entries since the last reflection, and the text of the prior 1-2 reflections for continuity. Assemble this into a single prompt to Claude with clear instructions matching the tone principles from the UX spec — lead with the most notable pattern or tension, close with one open question, and explicitly avoid prescriptive advice. Validate the response for minimum signal (if too few entries exist, return a graceful "not enough yet" message rather than forcing a low-quality reflection — this guardrail was called out as important in the MVP spec and should be enforced in code, not left to prompt instructions alone). Store the reflection with links back to the specific entry IDs used, and trigger the email notification. Keep this pipeline as a single well-tested function initially — resist the urge to build a generalized "insight engine framework" before there's evidence of what actually works.

## 7. Data Privacy and Security Principles

This product asks users to store their most personal thoughts, so security is not a later phase — it is a v1 requirement. Principles: enforce row-level security at the database layer so no application bug can leak one user's data to another; encrypt data at rest (default with Supabase) and in transit (TLS everywhere, no exceptions); never send user content to the AI provider or any third party for anything other than generating that user's own reflection, and say so plainly in a short, honest privacy policy rather than dense legal boilerplate; give users a real, working data-export and account-deletion path from day one (called out in the UX spec's Settings screen) — this is both an ethical baseline and a trust-building feature for a product in this category; avoid using user content to train or fine-tune any model without explicit, separate opt-in. Given how sensitive this data category is, a security or trust misstep here is a company-ending risk, not just a bug.

## 8. Future Scalability Considerations

Not needed for MVP, but worth keeping in view so early decisions don't block them: Supabase scales comfortably well past typical early-stage usage, so no near-term migration pressure is expected. If entry volume per user grows large, the reflection pipeline's context-assembly step will eventually need retrieval/summarization logic (e.g., embeddings-based retrieval of the most relevant past entries) rather than stuffing the full history into every prompt — defer this until real usage data shows it's needed. A native mobile app and additional life-domain modules (health, relationships, career from the long-term vision) are post-MVP platform decisions, not v1 architecture concerns, but the schema's per-domain extensibility (entries with typed themes) leaves room for them without a rewrite.

## 9. Development Phases for Claude Code

**Phase 1 — Foundation:** Set up Next.js + Supabase project, auth flow, and base schema with row-level security policies.
**Phase 2 — Capture loop:** Build Capture and Timeline screens, entry storage, voice transcription integration.
**Phase 3 — Reflection engine:** Build the scheduled reflection job, Claude API integration, reflection storage, and the Reflection screen.
**Phase 4 — Onboarding and polish:** Build the seed-reflection onboarding flow, Entry Detail screen, Settings, and email delivery.
**Phase 5 — Hardening:** Security review of RLS policies, privacy policy and data export/deletion flows, basic analytics for the MVP success metrics defined in the product spec.

Build and validate each phase against a real user (even just the founder) before moving to the next — this is a reflection product, and the fastest way to know if a phase works is to actually use it for a week.
