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

**What it is:** the durable behavioral/preference profile — not facts about the person, but *patterns* in how they operate. This now has two distinct layers, and the naming is deliberately kept separate because they're epistemically different:

| Layer | What it holds | Where | Origin |
|---|---|---|---|
| **Stated** (`personalDNA`) | `peak_focus_hours`, `learning_style`, `family_check_in_interval_days`, `habit_notes` | `personal_dna` table, one row/user | The user said so, at onboarding |
| **Inferred** (`personalPatterns` — the Personal DNA *Engine*) | Behavioral patterns with a confidence score | `personal_patterns` table, many rows/user | Atlas noticed it, from his actual data |

The stated layer shipped in Phase 1 and got its first real consumers earlier this session (chat system prompt, family page's stale-contact threshold). This section is about the inferred layer — **v1 is shipped.**

**Current state — v1 shipped.** `lib/intelligence/personalDNA/` is a self-contained module: every analyzer is a pure function (raw rows in, `PatternCandidate[]` out — no DB access, fully unit-tested), and exactly one server-only file (`analyze.ts`) does the fetching and writing. Four categories, all backed by real, already-collected data — nothing invented to fill a category that had no signal:

- **Focus** (`analyzers/focus.ts`) — per life-area category, the time-of-day window (`moments.occurred_at`, converted to Asia/Jerusalem local time — see below) where the user logs the most moments. *"הרגעים בתחום ידע מתועדים בעיקר בין 18:00–22:00."*
- **Learning** (`analyzers/learning.ts`) — recurring topic words across `knowledge_entries` (reuses `lib/memory/rankRelevance.ts`'s `tokenize`), and study-session cadence (entries/week over the observed span).
- **Goals** (`analyzers/goals.ts`) — task-size preference (does he finish more when goals are broken into many small milestones or few large ones — a real correlation across his own goal history, not a guess), goal momentum/stagnation (share of open goals untouched 14+ days), and milestone completion pace (needs `milestones.completed_at`, added in migration `20260720000003` — **only populates going forward**; milestones marked done before that migration have no pace evidence, deliberately left `null` rather than backfilled with a guessed timestamp).
- **Routine** (`analyzers/routine.ts`) — most-active weekday, and a 30-day activity-consistency score, both across the union of moments + knowledge entries.

**Health is explicitly not a category yet** — `health_logs` exists as a table (migration `20260720000001`) but has no write path anywhere in the app (the Health area page is just `AreaMomentsView`, generic moments UI). Building a health pattern today would mean analyzing zero rows and either producing nothing (fine, but pointless code) or being tempted to fabricate signal from `moments` tagged `health` (a much weaker proxy). Left out until the Health area gets a real logging flow.

**Confidence model** (`confidence.ts`) — deterministic, no ML:
- `calculatePatternConfidence(evidenceCount, strength)`: `strength` (0–1, how concentrated/clear the signal is) times an evidence-saturation curve (`evidenceCount / (evidenceCount + 5)`, so ~5 data points ≈ half-trust) times `MAX_CONFIDENCE` (0.95 — Atlas never claims certainty about a person). A brand-new, single-evidence assumption lands around 0.15–0.2; it climbs as more evidence accumulates, asymptotically, never touching 1.0.
- `resolvePatternUpdate(existing, fresh)`: the actual "DNA update" step. Recomputing a pattern that agrees with what's already stored uses the fresh (larger) evidence count as-is — confidence climbs naturally because there's more data behind the same belief. Recomputing a pattern whose *value* flipped (a genuine contradiction) applies a 0.7× discount to the fresh confidence — the new belief isn't instantly trusted, it has to earn that back over subsequent runs.
- `rankPatterns`: filters to `MIN_CONFIDENCE_TO_SURFACE` (0.3) and sorts by confidence — the one place "which beliefs are trustworthy enough to act on" is decided, so nothing downstream re-implements its own threshold.

**Data flow (the self-learning loop, concretely):**
```
User acts (logs a moment, completes a milestone, studies a shiur)
        ↓
app/actions/bootstrap.ts's getInitialState() runs (every app open)
        ↓  (after() — doesn't block the response)
analyzePersonalDNA(userId): fetch raw data -> run 4 analyzers -> get PatternCandidate[]
        ↓
For each candidate: resolvePatternUpdate(existing stored pattern, fresh candidate)
        ↓
personalPatternsRepo.upsert (one row per category+patternType+subject)
        ↓
Read path: getPersonalPatternDescriptions(userId) -> rankPatterns -> top 5 confident descriptions
        ↓
lib/context/buildAtlasContext.ts includes them as AtlasContext.personalPatterns
        ↓
Chat / goal breakdown / calendar suggestions fold them into their prompts/rationale
        ↓
(Not yet closed): user accepts/rejects/acts differently -> feeds back into future evidence
```
The trigger is deliberately simple — re-analyze once per app open, not per-mutation and not on a schedule (both would be over-engineering ahead of evidence they're needed; see §4's Notification Agent note for where a real scheduler eventually belongs). `next/server`'s `after()` runs it post-response so the user never waits for it.

**Integration, this session:**
- **Context Engine** — `AtlasContext.personalPatterns: string[]`, fetched alongside everything else in `buildAtlasContext`.
- **Chat** — a new system-prompt section, explicitly labeled as inferred-not-stated so the model doesn't present it as something the user said.
- **Goal breakdown** — patterns fold into the same context block active goals and memory already use, so a `taskSizePreference` belief can actually shape milestone count/size.
- **Calendar suggestions** — foundation only, as scoped: ranking (which area/slot wins) is untouched; a matching focus-window pattern for the suggested area now enriches the *rationale* text. No energy/focus-window-based re-ranking yet — that's the next increment, not this one.

**What's still open, honestly:**
- The feedback half of the loop (accept/reject/modify → confidence adjustment) isn't wired — `docs/ATLAS_ARCHITECTURE_VISION.md` §7 (self-improvement loop / `recommendation_events`) is the natural place this lands, once that table exists.
- `analyzePersonalDNA` and `lib/db/personalPatterns.ts` have no automated test (DB-dependent, same gap as `buildAtlasContext` — see §5). Every *analyzer* it calls is fully unit-tested; the orchestration wiring itself isn't yet.
- Calendar suggestions doesn't rank by focus window — deliberately deferred per this milestone's scope.

**Trigger for v2:** real usage accumulates (weeks, not days) such that patterns currently sitting below `MIN_CONFIDENCE_TO_SURFACE` start crossing it, or a concrete feature need justifies calendar re-ranking by energy/focus windows.

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

## 7. Intelligence Layer / Self-Improvement Loop — Recommendation Intelligence & Feedback Loop v1

**What it is:** tracking which AI recommendations get accepted, rejected, or modified, and feeding that back into future suggestions. This is the missing half of the loop the rest of this document describes: §3 (Personal DNA) infers patterns from what the user *does*; this layer records what Atlas *suggested* and what the user did about it — the ingredient §3's own "What's still open" section flagged as not yet wired.

**Current state — v1 shipped.** `recommendation_events` (migration `20260720000005`) is a durable log, one row per suggestion Atlas ever surfaces: `type`, `source`, `recommendation_payload` (jsonb — the suggestion's actual content, so later analysis never needs to reconstruct it from a join), `status`, `metadata` (jsonb, deliberately unused today beyond `{}` — headroom for whatever a future consumer needs without a schema change), `created_at`, `responded_at`.

**Status model** — five states, but only one has any valid outgoing transition:
```
pending → accepted | rejected | modified | expired
```
Once a user has responded (or a suggestion times out unanswered), that's final for v1 — there's no "un-reject" flow. Enforced twice, deliberately redundantly: atomically in `lib/db/recommendationEvents.ts`'s `recordOutcome` (a conditional `UPDATE ... WHERE status = 'pending'`, not a read-then-write — race-safe by construction), and explainably in `lib/intelligence/recommendations/feedback.ts`'s `isValidStatusTransition` (pure, unit-tested, the human-readable statement of the same rule).

**Feedback weighting** (`feedback.ts`, deterministic, -1..1):
| Status | Weight | Why |
|---|---|---|
| accepted | 1.0 | Reinforces future suggestions like this one |
| modified | 0.3 | Soft positive — the user engaged and adapted it rather than rejecting it outright; the shape was roughly right |
| rejected | -1.0 | Discourages future suggestions like this one |
| expired | -0.2 | Atlas's operational meaning of "ignored" — per explicit instruction, silence is never treated as a strong rejection |
| pending | 0.0 | No signal yet |

`calculateFeedbackConfidenceAdjustment` averages weight across a group of events into one signal; `summarizeRecommendationOutcomes` groups by `type` and only reports a group once it has ≥3 responses (noise floor, same reasoning as Personal DNA's evidence thresholds). Both are pure and fully unit-tested — no ML, every number traceable to actual accept/reject counts.

**Integration, this session — tracking added to the two surfaces that generate real suggestions today:**
- **Calendar suggestions** — each suggestion becomes a `pending` `recommendation_event` *before* it reaches the client; its real database id (not a client-random one, as before) becomes `SuggestedAction.id`. `acceptSuggestion`/`dismissSuggestion` in `store/useAtlasStore.ts` now also call `recordRecommendationOutcomeAction` (a thin Server Action) after the real action completes — accept records `accepted`, the explicit "ignore" button records `rejected` (it's an active user choice, not passive silence, so the stronger weight is correct).
- **Goal breakdown** — recorded as `accepted` at generation time, not `pending`: `GoalsPanel` has no review step (the returned milestones are applied to a new goal the instant they arrive), so a `pending` event here would be one nothing could ever transition out of. Payload includes `usedAI: boolean` so the real-AI and generic-fallback paths (`/api/goals/breakdown`'s existing honest-fallback behavior) are distinguishable in later analysis.
- **Chat and Torah — deliberately not touched.** Chat doesn't currently generate a structured, actionable suggestion a user can accept/reject (just conversation) — there's nothing to track yet. Torah extraction's interface (`createRecommendationEvent`'s `type`/`source` are free strings, no schema change needed) is ready for it, per this milestone's explicit "prepare the interface, don't build speculative flows" instruction — no Torah-specific code was added.

**Read path — `getRecommendationInsights(userId)`:** feeds `AtlasContext.recommendationInsights` (Context Engine, §5) with the highest-signal summaries (`"הצעות ליומן: מתקבלות בכ-80% מהמקרים (4 מתוך 5)."`), surfaced in chat's system prompt alongside personalPatterns. Starts empty — like every other inference layer in this document, it organically populates as real accept/reject events accumulate, rather than being seeded with anything invented.

**Deliberately not built this session** (per explicit scope and "clean interfaces, no tight coupling"):
- **Personal DNA does not consume recommendation feedback yet.** `resolvePatternUpdate` (§3) and `calculateFeedbackConfidenceAdjustment` (this section) are two separate, independently-testable confidence mechanisms — the former reconciles a pattern against its own history, the latter aggregates suggestion outcomes. Wiring feedback *into* pattern confidence (e.g., a rejected `family`-category calendar suggestion nudging that life area's `peakActivityWindow` pattern down) is real future value, but doing it now would mean designing a coupling contract ahead of evidence for what it should actually look like.
- **No active `expired` sweep.** The status exists and is fully handled by the feedback model, but nothing yet marks a long-pending suggestion `expired` — that needs a scheduled job, which is Notification Agent (§4) territory and equally deferred there.
- **Calendar suggestion ranking still doesn't consult `recommendationInsights`** — same "foundation, not rebuild" scope as §3's calendar integration.

**Trigger for the next increment:** enough `accepted`/`rejected` volume exists that a concrete surface (most likely calendar suggestions, since it already has the richest signal) would visibly benefit from feedback-adjusted ranking — at that point, design the Personal DNA coupling deliberately rather than reactively.

---

## 8. Database evolution

Current schema (`supabase/migrations/`) — 15 tables, all user-scoped (directly or via a foreign key), all applied and verified live: `users`, `life_area_scores`, `people`, `moments`, `upcoming_events`, `knowledge_entries`, `daily_intentions`, `personal_dna`, `goals`, `milestones` (now with `completed_at`), `chat_messages`, `insights`, `health_logs`, `personal_patterns`, `recommendation_events`.

This schema already *is* the Memory Engine's storage layer (§2), the Personal DNA Engine's storage layer (§3), and — as of this session — the Recommendation Intelligence layer's storage (§7). The near-term database work implied by this document, in priority order:

1. **Nothing, for Memory Engine v1** — it reads existing tables. *(done)*
2. **`recommendation_events`** (§7) — small, additive, no dependencies. *(done, migration `20260720000005`)*
3. **`tsvector` + GIN index columns** on `moments`, `knowledge_entries`, `insights` — for Memory Engine v2, once v1 shows the need.
4. **`pgvector` extension + `embedding` columns** — for Memory Engine v3, gated as described in §2.

RLS stays exactly as documented in `docs/BACKLOG.md`: enabled fail-closed on every table, with `user_id` filtering in `lib/db/*.ts` as the actual enforcement boundary while the service-role key is how the app talks to Postgres. This document doesn't change that — it's a deliberate, documented, revisit-when-a-feature-queries-Supabase-from-the-client decision, not an oversight.

---

## 9. Atlas Intelligence Engine — the unified decision pipeline

**What it is:** the layer that turns four independent intelligence sources (Memory §2, Context Engine §5, Personal DNA §3, Recommendation feedback §7) into one deterministic, explainable, ranked signal every AI-backed route consumes — instead of each route independently deciding, by hand, which facts to mention and in what order.

**This is explicitly not an agent, an orchestrator, or a workflow engine.** There's no event bus, no autonomous decision-making, no ML, no embeddings beyond what Memory Engine v1 already uses (plain keyword ranking), no prediction. It's a pure, synchronous transformation of data the Context Engine already fetched — `AtlasContext in, ranked signals out` — that happens to live in its own module because the transformation itself (normalize → rank → check for competing priorities → render) is now genuinely shared across four call sites, not because it needed a grander name.

**Why now, not before — the audit that justified it:** before this milestone, `lib/chatSystemPrompt.ts`, `/api/goals/breakdown`, and `/api/torah/extract` each independently called `joinContextSections([formatContextSection(...), ...])` with an author-picked, hardcoded section order and category subset — the same "assemble text from AtlasContext" pattern written three times, differing only in which sections and what order. `/api/calendar/suggestions` had a lighter version of the same problem: `relationshipSignals[0]` and `personalPatterns.find(...)` — "pick whichever matters most," decided by array position rather than any actual comparison. That's real, demonstrated duplication (not a hypothetical one), which is what justified building this rather than leaving each route to hand-roll its own ordering indefinitely.

**Signal lifecycle — the five stages:**

```
AtlasContext (already fetched by the Context Engine, §5)
        ↓  Stage 1: Collect — nothing to do here; §5 already did it
AtlasContext's 8 fields (personalDNA, activeGoals, lifeAreas, upcomingEvents,
relevantMemory, relationshipSignals, personalPatterns, recommendationInsights)
        ↓  Stage 2: Normalize — buildIntelligenceSignals()
IntelligenceSignal[] — every item classified into one of 8 categories, with
category-level importance/confidence and (currently flat) recency
        ↓  Stage 3: Rank — rankSignals()
RankedSignal[] — score = 0.5·importance + 0.3·confidence + 0.2·recency,
sorted descending, deterministic category-priority tie-break
        ↓  Stage 4: Conflict detection — detectPriorityConflicts()
PriorityConflict[] — competing high-ranked categories flagged, not resolved
        ↓  Stage 5: Prompt assembly — formatSignalsForPrompt()
Plain text, ready to drop into a system prompt or rationale string
```

**Stage 2 — normalize** (`lib/intelligence/core/normalize.ts`). `buildIntelligenceSignals(context: AtlasContext)` maps every field to a `SignalCategory` (`personalDNA`, `personalPattern`, `goal`, `lifeArea`, `upcomingEvent`, `relationship`, `memory`, `recommendation`). A documented, deliberate simplification: AtlasContext's fields arrive as **already-formatted strings** (§5's own design — "callers don't need to know the underlying entity shapes"), which means the original per-item numeric confidence some of these came from (a personalPattern's real confidence score, a memory item's real recency) was already discarded before reaching this boundary. Recovering it would mean widening AtlasContext's contract for every existing consumer just to serve this one new one — not justified by real duplication, so it wasn't done. Instead, normalization applies **category-level** defaults (a stated preference is more certain than an inferred pattern; a dated commitment is more certain than a possibly-stale memory) — every default is a named constant in `CATEGORY_DEFAULTS`, not a magic number. One real per-item signal *is* computed here: a life area scoring below 40 gets an importance boost, the same "weakest area matters most" rule calendar suggestions already ranked by, now expressed once instead of reimplemented.

**Stage 3 — rank** (`lib/intelligence/core/rank.ts`). `score = 0.5·importance + 0.3·confidence + 0.2·recency` — importance weighted highest (it's the category-level "does this matter" judgment), confidence next (so a low-certainty inference can't outrank a well-evidenced one just by being tagged important), recency smallest. **Honest limitation, stated plainly:** recency is flat at 1.0 for every signal in v1, because real per-item recency isn't recoverable at the AtlasContext boundary either (same reasoning as Stage 2) — the term stays in the formula, not hardcoded away, so a future signal source that does carry real timestamps slots in without changing the scoring contract. Ties break on an explicit, documented category-priority order (dated commitments → active commitments → relationships → what Atlas knows about the person → retrieved history → ambient state → aggregate feedback), then on input order via `Array.prototype.sort`'s guaranteed stability (ES2019+) — fully deterministic, verified by a dedicated stable-ordering test.

**Stage 4 — conflict detection** (`lib/intelligence/core/conflicts.ts`), scoped honestly. True temporal conflict detection ("this suggestion collides with a real calendar slot," the kind of reasoning in this milestone's own illustrative example) would need structured start/end times on every signal type — most (goals, relationships, memory, personalDNA) don't carry one, for the same reason recency doesn't. What v1 actually detects: **priority competition** — among the top 5 ranked signals, category pairs that routinely compete for the same attention (`goal`↔`relationship`, `goal`↔`upcomingEvent`, `relationship`↔`upcomingEvent`) get flagged with a plain-language note. This is real and useful — it tells a caller "you're choosing between two genuine priorities" — without pretending to a scheduling-collision capability the data doesn't support. Checked against the *top of the ranking* rather than an absolute score threshold: an absolute cutoff turned out to be miscalibrated against `CATEGORY_DEFAULTS` during development (most categories clear a naive 0.7 threshold by construction, regardless of content) — using rank position instead sidesteps re-tuning a threshold against defaults that live in a different file.

**Stage 5 — explainability & rendering** (`lib/intelligence/core/format.ts`). Every `RankedSignal` carries a `reason` string (e.g., "חשיבות גבוהה, ביטחון גבוה") — Atlas can always answer "why is this here" for any signal, even though `formatSignalsForPrompt` doesn't inline the full reason into every prompt line (would bloat the prompt for no benefit the LLM needs). What it *does* inline: a `(ביטחון נמוך)` hedge on any signal below 0.5 confidence, so a weak inference is never rendered with the same authority as a certain fact — literally "if confidence is low, say so," as instructed.

**Integration — four surfaces, functionally-identical behavior, infrastructure-only change:**
| Route | Categories considered | What changed |
|---|---|---|
| `/api/chat` (`lib/chatSystemPrompt.ts`) | all 8 | Previously 8 hardcoded titled sections in a fixed order; now one ranked list, competing-priority notes surfaced when relevant. |
| `/api/goals/breakdown` | personalDNA, personalPattern, goal, memory | Previously a hand-picked 3-section block plus a separately-special-cased `learning_style` note; now personalDNA is a normal signal like everything else, one call replaces both. |
| `/api/torah/extract` | memory | Scope unchanged (it only ever used `relevantMemory`) — same information, now ranked instead of dumped in arrival order. |
| `/api/calendar/suggestions` | relationship, personalPattern | Not an LLM prompt — enriches rationale text. `relationshipSignals[0]` → top-ranked relationship signal; `personalPatterns.find(...)` → top-ranked matching personalPattern signal. Suggestion *ranking* (which life area, which slot) is untouched. |

**Performance:** the engine adds zero DB queries — it's a pure, synchronous transform over data `buildAtlasContext` already fetched in one parallelized `Promise.all` (§5, unchanged). Normalizing and ranking a few dozen signals is a single `O(n log n)` sort; each route calls it exactly once per request. No new allocation pattern beyond mapping small arrays. The engine is not on a hot path different from where `buildAtlasContext` already was.

**What's deliberately not built:** literal calendar-collision conflict detection (§ above); real per-signal recency (needs AtlasContext's contract to widen, not justified by current duplication); feeding `detectPriorityConflicts`' output into anything beyond a chat-prompt note (e.g., actually re-ranking calendar suggestions around a detected conflict); any structured coupling to Personal DNA confidence (`resolvePatternUpdate`, §3) or recommendation feedback (`calculateFeedbackConfidenceAdjustment`, §7) beyond both already being inputs to the *same* signals this engine ranks — genuinely a v2 concern, once real usage shows what the coupling should look like.

**Trigger for the next increment:** a fifth AI-backed surface ships (validates the abstraction generalizes past four hand-picked call sites), or real per-item recency becomes available at the AtlasContext boundary for a concrete reason (e.g., Memory Engine v2's full-text search naturally exposing it) — at that point recency stops being a constant and the scoring formula's weights are worth re-examining against real data instead of the initial, reasoned-but-untested 0.5/0.3/0.2 split.

---

## 10. Experience Layer — making the intelligence visible

**What it is:** the product-experience discipline that governs how everything §1–§9 built actually reaches the user. Every prior section was backend: memory, context, inferred patterns, feedback, ranking. None of it was visible anywhere except folded into LLM prompts. This section is about exposure, not new capability — no new engine, no new AI architecture, explicitly out of scope per this milestone's own constraints.

**Interaction philosophy.** Atlas should never read as a dashboard, a spreadsheet, a form, an admin panel, or a database viewer — every screen answers *"what matters right now"*, not *"here is all your data."* Concretely, that means: a screen leads with synthesis (a ranked, prioritized view) before it lists raw records; empty states are quiet, not gamified ("no data yet, keep going!" is a dopamine loop, not calm design — an empty `AIBriefing` simply doesn't render, the same way `ScheduleSuggestions` already did nothing rather than show a fake "you're all caught up!" card); and nothing is invented to fill a section that has no real signal behind it yet.

**UI principles, applied this milestone:**
- **Reuse before inventing.** `AIBriefing`'s confidence-adjacent styling reuses the exact thin-progress-bar primitive `GoalsPanel` and the areas hub already use for score/progress — a new visual language for "here's a number 0–100" would have been an inconsistency, not an improvement. Every new component (`AIBriefing`, the redesigned `ScheduleSuggestions` cards) is built from `GlassCard`, the existing accent-color tokens, and the existing spacing scale — no new design tokens introduced.
- **No fabricated personalization.** The dynamic greeting (`lib/greeting.ts`) is real — computed from the browser's actual clock, not a canned rotation of phrases. Calendar suggestions' new confidence indicator (`lib/suggestionConfidence.ts`) is a real, deterministic function of how far a life area lags the average of all areas — not an invented "AI confidence" number with no basis. Where a genuinely real signal wasn't cheaply available (a "you completed two milestones yesterday" achievement line would have needed exposing `milestones.completed_at` further up the stack than this milestone touches), the section was left out rather than faked — see `docs/BACKLOG.md`.
- **Explainability made concrete, not just theoretical.** §9 already gave every ranked signal a `reason` and a confidence-based hedge; `AIBriefing` is the first surface where a person, not a model, reads that hedge (`ביטחון נמוך`) directly.

**Motion philosophy.** Nothing new was introduced — the existing conventions (`framer-motion`, 0.25–0.5s durations, `easeOut`, `y`-offset fades, no spring/bounce physics, staggered `delay` per list item) were already correct and are what every new component (`AIBriefing`'s skeleton-to-content transition, the redesigned suggestion cards) follows. Motion communicates arrival order and hierarchy (later `delay` = lower priority on the page), never decoration.

**Decision transparency.** Every number shown to the user in this milestone traces to a named, documented, testable function: `computeSuggestionConfidence` (suggestion confidence), `rankSignals`'s `score`/`reason` (briefing ordering and its `ביטחון נמוך` hedge), `detectPriorityConflicts` (the gentle "competing priorities" note). Nothing in the Experience Layer is a black box the backend can't already explain — this section exposes §9's explainability model, it doesn't add a second one.

**What shipped this milestone (Experience Layer v1) — audited, prioritized, and scoped from the full brief, not attempted wholesale:**
- Dynamic, real time-of-day greeting (`app/page.tsx`, `lib/greeting.ts`).
- `AIBriefing` — the flagship "what matters right now" card, `app/api/briefing/route.ts` + `components/features/AIBriefing.tsx`, the first non-LLM consumer of the Intelligence Engine (§9).
- Upgraded recommendation cards (`ScheduleSuggestions.tsx`): real effort (slot duration), real confidence (a progress bar, reusing the existing primitive), clearer accept/dismiss actions. "Modify" was deliberately not added as a UI action — no real modify flow exists anywhere in the app yet (`recommendation_events.status` supports `modified`, but nothing produces it), and a button with no real behavior behind it would be exactly the fabricated interaction this layer exists to avoid.
- Today page reassembled around the briefing as the hero, without touching any underlying business logic — every existing store action, Server Action, and data flow is untouched.

**Explicitly deferred to Experience Layer v2** (audited, not forgotten — see `docs/BACKLOG.md` for the full list): Timeline/Goals/Learning/Torah/Relationships experience redesigns (each currently functional and calm, but plain — task lists and logs, not journeys); a full cross-app motion and design-consistency audit; a full accessibility audit beyond what new components got individually (keyboard, ARIA, focus management, contrast, reduced-motion, touch targets); visual-intelligence indicators (pattern/momentum/streak badges) beyond `AIBriefing`'s category icons; and any UI for the recommendation-feedback `modified` status, which needs a real edit flow to exist first.

**Trigger for the next increment:** the same audit discipline applied to Today gets applied to one more screen — Timeline is the natural next candidate (`docs/BACKLOG.md` already flags it as moments-only when it could span goals/knowledge/health) — once there's real usage data suggesting which of the deferred screens actually needs it most, rather than working the list top-to-bottom by assumption.

---

## 11. What this document is not

It is not a rewrite plan. Nothing in `app/`, `components/`, `lib/`, or `store/` needs to change shape to support §1–§10 — every "target" above is additive to what exists, and most of it (§2 v1, the personalDNA wiring in §3, the agent-shaped routes in §4, the Intelligence Engine in §9, the Experience Layer in §10) either already works or is a small, bounded next step. Re-read `docs/BACKLOG.md` and `docs/ROADMAP_V2.md` for what's actually being worked on next; treat this document as the map those decisions get checked against, not a new backlog to work through top-to-bottom.
