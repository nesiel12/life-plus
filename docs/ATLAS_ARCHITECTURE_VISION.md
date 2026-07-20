# Atlas — Architecture Vision

This is the long-term source of truth for where Atlas's intelligence layer is going. It does not replace `docs/BACKLOG.md` (near-term, actively-maintained work) or `docs/ROADMAP_V2.md` (phase sequencing) — it sits above them, describing the target shape each phase is walking toward. When a phase's work touches one of the systems below, update this document; don't fork a parallel doc for it.

**Operating principle, stated once so it doesn't need repeating in every section below:** every piece of architecture here gets built when a real feature needs it, not before. Atlas today is a single-user product with three real AI-backed endpoints. Standing up formal infrastructure for a scale or intelligence level the product hasn't reached yet is waste, not foresight — it's also actively harmful, because speculative abstractions get the shape wrong and have to be redone once real requirements show up. Each section below ends with "Current state" and "Trigger to build" for exactly this reason.

---

## 1. The shape of the whole system

```
User Data (moments, goals, people, knowledge, health, chat, calendar)
        ↓
Life Events (a moment/goal/interaction/entry actually happening)
        ↓
Memory Engine (what Atlas keeps and can retrieve about a person)
        ↓
Personal DNA Engine (who this person is — patterns, not facts)
        ↓
Context Engine (what's relevant right now, for this request)
        ↓
AI Agents (specialized reasoning over that context)
        ↓
Recommendations (surfaced to the user, always reversible, always attributable)
```

This is a data-flow model, not a service-boundary model. It does **not** imply five microservices or a message bus — at Atlas's current and near-term scale, this whole pipeline lives inside the Next.js app, mostly as plain TypeScript functions and Postgres queries. The boundaries matter for reasoning about the system, not for how it's deployed.

---

## 2. Memory Engine

**What it is:** the mechanism by which something a user does or says becomes something Atlas can draw on later — in a different conversation, a different life area, months later.

**Memory types**, mapped to what already exists:

| Type | Description | Current table(s) |
|---|---|---|
| Personal facts | Name, preferences, important dates | `users`, `people` |
| Behavioral memory | Habits, rhythm, learning style | `personal_dna` |
| Relationship memory | People, moments, interaction history | `people`, `moments` (category=`family`) |
| Knowledge memory | Books, shiurim, ideas, projects | `knowledge_entries` |
| Life memory | Milestones, achievements, reflections | `moments`, `insights`, `goals` |

**Current state — v1 (lexical retrieval) shipped and live in three of the four AI-backed routes.** `lib/memory/retrieveRelevantMemory(userId, query, limit)` ranks moments/knowledge_entries/insights by keyword overlap + recency and is called (via the Context Engine, §5) from chat, goal breakdown, and Torah extraction — each with a task-appropriate query (the chat message, the new goal's title, the extracted text). Calendar suggestions deliberately doesn't call it (no natural-language query to rank against). Storage existed since Phase 1; recall now does too.

**Target:** the function signature above already is the target for v1 — what's left is v2/v3 below, gated on real evidence they're needed, not built ahead of it.

**Path, in order:**
1. **v1 — lexical retrieval.** Rank existing rows (moments, knowledge_entries, insights) by simple keyword/recency scoring, entirely in application code, no schema change. Same technique already used by Torah Space's `findRelatedSessions`. Good enough at single-user, hundreds-of-rows scale, and ships a real "Atlas remembers" experience immediately.
2. **v2 — Postgres full-text search** (`tsvector` columns + GIN indexes) once keyword relevance in v1 visibly misses things a straightforward text index would catch. Still no new infrastructure — Postgres native.
3. **v3 — semantic (embeddings) retrieval** via `pgvector` (Supabase supports it natively) once (a) data volume makes lexical/full-text recall noticeably weak, or (b) a feature genuinely needs conceptual similarity rather than keyword overlap (e.g. "what have I written that relates to this, even if it doesn't share words"). This is a real schema addition — an `embedding vector(1536)` column and an embedding-generation step on write — and should not happen before v1/v2 prove insufficient.

**Trigger to build v1:** now — see §8, this is the first concrete feature this document leads into.
**Trigger to build v2/v3:** v1 shipped and observed to miss relevant results in real use; or per-user row counts grow past what a single unindexed scan handles comfortably (low thousands).

---

## 3. Personal DNA Engine

**What it is:** the durable behavioral/preference profile — not facts about the person, but *patterns* in how they operate.

**Current state:** the `personal_dna` table and onboarding flow already capture `peak_focus_hours`, `learning_style`, `family_check_in_interval_days`, and free-form `habit_notes`. As of this session, this data has its first two real consumers: it shapes the chat system prompt (`lib/chatSystemPrompt.ts`) and the family page's stale-contact threshold. It does **not** yet influence calendar-suggestion ranking, goal planning, or learning recommendations.

**Target:** every AI-facing surface (chat, calendar suggestions, goal breakdown, learning/Torah summarization) reads personalDNA as ambient context, the same way it now does for chat. The profile itself should also grow richer over time — not just onboarding answers, but *inferred* patterns (e.g., "moments tagged `career` cluster in the evening" derived from `moments.occurred_at`), once there's enough data for an inference to be trustworthy rather than a guess dressed up as a fact.

**Path:**
1. Wire existing structured fields (`family_check_in_interval_days` — done) into every feature that has an obvious structured use, before touching the free-text fields.
2. For free-text fields (`peak_focus_hours`, `learning_style`), keep passing them as LLM context (cheap, honest, already correct) rather than trying to parse them into rigid structures — parsing "בבוקר מוקדם" into a time range is a lossy, fragile translation an LLM handles better than a regex.
3. Only once (1) and (2) are exhausted does *inferred* DNA (patterns mined from behavior rather than stated in onboarding) become the next increment — and it should ship as a visible, explainable insight ("You tend to log career moments in the evening — want suggestions timed around that?"), never a silent hidden variable the user can't see or correct.

**Trigger to build inferred DNA:** enough real usage history exists (weeks, not days) that a mined pattern would be signal, not noise from n=3.

---

## 4. AI Agent System

**What it is, per the product vision:** specialized reasoning units (Memory, Calendar, Learning, Torah, Relationship, Health, Goal, Reflection, Analytics, Planning, Notification) that all communicate through an "Atlas Core."

**Current state — read this carefully before building anything here:** Atlas already has the *functional* equivalent of several of these "agents," and they work, because they were built as focused server-side functions with clear inputs/outputs rather than as a formal multi-agent framework:

| Named agent | Current implementation |
|---|---|
| Calendar Agent | `app/api/calendar/suggestions` (ranks free slots by weakest life area) + `app/api/calendar/events` (writes accepted suggestions to Google Calendar) |
| Goal Agent | `app/api/goals/breakdown` (LLM-generated milestone breakdown) |
| Learning/Torah Agent | `app/api/torah/extract` (PDF/audio → topic/source/summary) |
| Reflection Agent (partial) | `AICompanion` chat, now personalDNA-aware |

**What's genuinely missing** isn't more agents — it's a Memory Agent (§2) and any Analytics/Notification/Planning agent at all, because there's no scheduled/background execution model yet (everything today is user-triggered, request/response).

**Target — and the important architectural call:** do **not** build a formal agent framework (orchestrator, message bus, agent registry) speculatively. Every "agent" above is a well-scoped server function, independently testable, independently deployable, and that has been the right size for the actual problem so far. The point at which a real framework earns its cost is when either (a) agents need to call *each other* dynamically at runtime (not just share data through Postgres), or (b) there's a genuine scheduling/orchestration need (see Notification Agent below) that a cron job can't express cleanly. Until then, "Atlas Core" is Postgres plus shared TypeScript modules (`lib/`) — every agent already reads/writes the same tables and the same mapper functions, which *is* the integration layer, just not a ceremonial one.

**The one new capability this implies:** a Notification/Planning "agent" needs something none of the current agents have — the ability to run *unprompted*, on a schedule, not in response to a request. That's a real gap (see `docs/BACKLOG.md`'s Future Vision: "a genuine unprompted background AI behavior"). When that gets built, it should be a Vercel Cron / Supabase Cron job calling the same server-side functions the request-driven routes already call — not a new execution model.

**Trigger to build a real orchestration layer:** a concrete feature requires one agent's output to dynamically decide which other agent runs next, at runtime, with branching — not before.

---

## 5. Context Engine

**What it is:** the layer that decides, for a given moment (a chat message, a page load, a scheduled job), what subset of memory + personalDNA + recent activity is actually relevant to assemble into a prompt or a UI.

**Current state — shipped (Context Engine v1).** `lib/context/buildAtlasContext(userId, { query? })` is the one place that assembles personalDNA, active goals, life-area scores, upcoming events, relationship signals (stale-contact detection, reusing the same rule as the family page), and — when a query is given — Memory Engine (§2) retrieval, all in one parallelized fetch. It returns `AtlasContext`, a plain object of pre-formatted strings/rows that every AI-backed route now consumes instead of independently fetching and formatting its own slice:

| Route | Query passed | What changed |
|---|---|---|
| `/api/chat` | the user's message | Previously fetched personalDNA + memory inline; now one `buildAtlasContext` call feeds the whole system prompt (personalDNA, life-area balance, active goals, upcoming events, relationship signals, relevant memory). |
| `/api/goals/breakdown` | the new goal's title | Previously had zero user context at all — a bare title+category prompt. Now sees the user's other active goals (avoid redundant milestones) and related past memory, and adapts to `learning_style` when set. |
| `/api/torah/extract` | the extracted/transcribed text | Previously had zero user context. The summarization call now sees related past knowledge/moments, so a new shiur can be summarized with awareness of what he's studied before. |
| `/api/calendar/suggestions` | — (no query; not memory-driven) | Previously trusted whatever life-area scores the *client* sent in the request body. Now fetches its own canonical scores server-side, and a family-category suggestion's rationale names a specific overdue contact when `relationshipSignals` has one. |

`lib/context/formatContext.ts` (`formatContextSection`/`joinContextSections`) is the one shared "turn a list of facts into a titled bullet block" helper — previously duplicated ad hoc inside `lib/chatSystemPrompt.ts`; now every route above uses it instead of hand-rolling prompt-section formatting.

**What's still route-specific, deliberately:** each route decides *how* to fold `AtlasContext` into its own task-specific prompt — chat's system prompt looks nothing like the goal-breakdown system prompt, and shouldn't. The Context Engine unifies *gathering*, not the reasoning task built on top of it — that's the line that keeps this from becoming "one AI implementation forced to serve four features."

**Target, next increment:** `buildAtlasContext` itself has no automated test yet (it's a thin composition of repo calls + the same formatting logic already tested elsewhere, but "thin" isn't a substitute for tested — see `docs/BACKLOG.md`). Beyond that, this module is the natural place a future Analytics/Notification agent (§4) would also read from, once one exists.

**Trigger to build v1:** done, this session — see the commit history around this section.
**Trigger for the next increment:** an integration-test setup that can exercise `buildAtlasContext` against a real or mocked Supabase client (currently blocked on the same "no integration test harness yet" gap as every other DB-backed route).

---

## 6. Life Timeline

**What it is:** per the product vision, a visual, chronological view across every life area — books, studies, projects, achievements, relationships, goals — as "a personal history of growth."

**Current state:** `app/timeline/page.tsx` already renders a real, chronological, store-backed feed of `moments`. What it doesn't yet do: pull in goals, knowledge entries, and health logs as timeline events (currently moments-only), or visually distinguish life areas beyond a color bar.

**Target:** extend the existing timeline to be a true cross-entity feed (union of moments, completed goals/milestones, knowledge entries, significant health events), sorted by date, still using the same `momentCategoryColorVar`-style area theming already established. This is additive to existing code, not a rebuild — the shared moment-card pattern flagged in `docs/TECH_DEBT.md` #14 becomes relevant again once a second entity type needs the same card shape.

**Trigger to build:** whenever it's picked up off `docs/BACKLOG.md` — this is UI/data-shape work, not infrastructure, and doesn't block or get blocked by anything else in this document.

---

## 7. Intelligence Layer / Self-Improvement Loop

**What it is:** tracking which AI recommendations get accepted, rejected, or modified, and feeding that back into future suggestions.

**Current state:** does not exist. `acceptSuggestion`/`dismissSuggestion` change local+DB state but nothing records *that a recommendation was made and what happened to it* as its own fact.

**Target:** a lightweight `recommendation_events` table (`user_id`, `kind`, `payload`, `outcome` [`accepted`/`dismissed`/`modified`], `created_at`) that every "Atlas suggested X" surface writes to. This is cheap to add and valuable early (even before there's enough volume to actually learn from it, it's the historical record that later analysis depends on — the mistake to avoid is *not* logging it now and having no data once it's wanted).

**Trigger to build:** the next time a new suggestion-surfacing feature ships (calendar suggestions already exist and could be retrofitted cheaply; a second surface — e.g. a Torah "related session" suggestion — makes the pattern worth generalizing rather than one-off).

---

## 8. Database evolution

Current schema (`supabase/migrations/`) — 13 tables, all user-scoped, all applied and verified live: `users`, `life_area_scores`, `people`, `moments`, `upcoming_events`, `knowledge_entries`, `daily_intentions`, `personal_dna`, `goals`, `milestones`, `chat_messages`, `insights`, `health_logs`.

This schema already *is* the Memory Engine's storage layer (§2) and the Personal DNA Engine's storage layer (§3) — nothing about "adding memory" requires new tables today. The near-term database work implied by this document, in priority order:

1. **Nothing, for Memory Engine v1** — it reads existing tables.
2. **`recommendation_events`** (§7) — small, additive, no dependencies.
3. **`tsvector` + GIN index columns** on `moments`, `knowledge_entries`, `insights` — for Memory Engine v2, once v1 shows the need.
4. **`pgvector` extension + `embedding` columns** — for Memory Engine v3, gated as described in §2.

RLS stays exactly as documented in `docs/BACKLOG.md`: enabled fail-closed on every table, with `user_id` filtering in `lib/db/*.ts` as the actual enforcement boundary while the service-role key is how the app talks to Postgres. This document doesn't change that — it's a deliberate, documented, revisit-when-a-feature-queries-Supabase-from-the-client decision, not an oversight.

---

## 9. What this document is not

It is not a rewrite plan. Nothing in `app/`, `components/`, `lib/`, or `store/` needs to change shape to support §1–§8 — every "target" above is additive to what exists, and most of it (§2 v1, the personalDNA wiring in §3, the agent-shaped routes in §4) either already works or is a small, bounded next step. Re-read `docs/BACKLOG.md` and `docs/ROADMAP_V2.md` for what's actually being worked on next; treat this document as the map those decisions get checked against, not a new backlog to work through top-to-bottom.
