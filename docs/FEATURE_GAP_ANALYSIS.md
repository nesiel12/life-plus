# Atlas — Feature Gap Analysis

This measures V0 against two references: (1) the LifeOS product pillars that were explicitly scoped for this build, and (2) the original framing of Atlas as a *"Personal AI Reflection SaaS designed for scale... potential future acquisition."* Gap ≠ blame — a prototype is supposed to have gaps. The point is to stop treating any of them as implicitly "basically done."

Status key: ✅ Done and real · 🟡 Partial · 🎭 UI exists, backed by mock/static data · ❌ Missing entirely.

---

## Pillar 1 — Architectural layers (Today / Areas / Background AI)

| Capability | Status | Notes |
|---|---|---|
| Today dashboard | 🟡 | Renders real store data, but nothing on it is server-fetched or persisted; it's a live view of volatile in-memory state. |
| Areas hub + 5 domain pages | ✅ (structurally) | Navigation and layout are real; the *data* each page shows is the same volatile store. |
| Background AI (ambient, proactive) | 🎭 | The only "background" AI today is a floating chat button a user has to click. Nothing runs unprompted — no scheduled analysis, no push notification, no digest. "Proactive" is currently entirely reactive. |

## Pillar 2 — AI Memory & Personal DNA

| Capability | Status | Notes |
|---|---|---|
| Conversational one-question-at-a-time onboarding | ✅ | Real, in-app, Hebrew, writes to `personalDNA`. |
| Deep trait extraction from *natural* free-form conversation | ❌ | Current onboarding is a fixed 3-question script with light regex parsing (`familyCheckInIntervalDays` extracts digits; everything else is stored verbatim). It does not use the LLM to interpret answers — it's a form with conversational styling, not an AI interview. |
| Traits actually *used* to personalize behavior | ❌ | `personalDNA` is written once and never read anywhere else in the app. `peakFocusHours` and `learningStyle` don't currently influence scheduling suggestions, chat tone, or anything else. It's collected and then inert. |
| Long-term memory across sessions | ❌ | No persistence (see `ARCHITECTURE_AUDIT.md` §1–2) means "memory" resets constantly. There is also no vector store / RAG layer for the AI to draw on past moments when chatting — `chatHistory` is passed as raw recent turns only. |

## Pillar 3 — Proactive Scheduling & Goals

| Capability | Status | Notes |
|---|---|---|
| Real Google Calendar free/busy read | ✅ | Genuinely calls the Google API with the session's access token. |
| Suggestions ranked by weakest life area | ✅ | Real, simple, rule-based (lowest score wins) — not ML-driven, but honestly built and functional. |
| "Accept" a suggestion → writes back to Google Calendar | ❌ | Accepting only appends to the local `upcomingEvents` array in Zustand. **No event is ever created in the user's actual calendar.** This is the most likely feature to visually look "done" while not doing the thing its label implies. |
| Access token refresh | ❌ | The Google access token obtained at sign-in is never refreshed. It will expire (~1 hour, Google's standard lifetime) and calendar suggestions will silently stop working until the next sign-in. No refresh-token rotation is implemented despite `access_type: "offline"` being requested (a refresh token is likely being issued and simply discarded). |
| Goal → milestone breakdown | ✅ / 🎭 | Real AI call when `OPENAI_API_KEY` is set; falls back to a fixed 4-step generic template otherwise. Both paths are honestly labeled in code, at least. |
| Reminders / nudges toward goals and milestones | ❌ | Milestones can be checked off manually; nothing reminds, schedules, or resurfaces a stale goal. |

## Pillar 4 — Specialized Modules

### Torah Space
| Capability | Status | Notes |
|---|---|---|
| Upload UI (PDF/audio) | ✅ | Real file picker, correct `accept` filter. |
| Actual transcription/summarization of the uploaded file | 🎭 | **Fully mocked.** `handleFileSelected` ignores the file's real content entirely and returns a hardcoded topic/source/summary after a `setTimeout`. Uploading *any* file — a grocery list, a blank PDF — produces the identical fake "הלכות תפילה בציבור" result. This is the single largest gap between how a feature *looks* finished and how not-started it actually is. |
| Q&A over study history | ❌ | Not implemented anywhere. |
| "Related past sessions" matching | 🟡 | Real but naive — a client-side keyword-overlap check (`findRelatedSessions`) against the (also-fake) extracted topic string. Not semantic search. |

### Family Care
| Capability | Status | Notes |
|---|---|---|
| Per-person last-contact tracking | ✅ | Real, store-backed. |
| Birthday tracking + countdown | ✅ | Real, correctly computed (`daysUntilNextBirthday`), and deliberately seeded empty rather than with invented dates for real people. |
| Proactive reminders (push/email/notification) | ❌ | The "stale contact" and "birthday soon" signals only render as passive text on a page the user has to open. Nothing pushes this information *to* the user. |

---

## Cross-cutting: Gmail scope requested, never used

The app requests `gmail.readonly` at OAuth consent time (`lib/auth.ts`) — the user grants Atlas read access to their email — and then **nothing in the codebase reads Gmail, ever.** This is worth flagging specifically: it's a real trust liability (asking for access you don't use erodes user trust and fails any OAuth app-verification review) with zero corresponding feature. Either build the feature this scope implies (e.g., surfacing meaningful emails as Moments, or family-related email nudges) or remove the scope until it's built.

---

## SaaS fundamentals (implied by "Personal AI Reflection SaaS... potential future acquisition")

None of the following exist yet. Listed flatly because a "billion-dollar startup" framing implies these aren't optional:

- **Multi-tenancy / account model** — no signup flow beyond "any Google account," no per-user data isolation (see `ARCHITECTURE_AUDIT.md` §3).
- **Billing / plans** — no Stripe or equivalent, no concept of a paid tier, free tier, or usage limits (relevant given every AI call currently has zero rate limiting).
- **Account settings / profile management UI** — no way to edit `user` fields, change the name shown, manage connected accounts, or revoke Google access from within the app.
- **Data export / account deletion** — no user-initiated data export (increasingly a baseline expectation, and a compliance requirement in many jurisdictions once real personal data — Torah notes, family details, chat history — is stored server-side) and no account-deletion flow.
- **Notifications infrastructure** — no email sending, no push notifications, no digest emails. Every "proactive" and "reminder" concept in the product vision currently depends on infrastructure that doesn't exist.
- **Search** — no way to search past moments, chat history, or Torah sessions; the only retrieval mechanism is scrolling the Timeline or an Area page.
- **Mobile / PWA** — no manifest, no offline support, no installability. Fully desktop-web-browser-shaped today.
- **Admin/ops visibility** — no way for anyone operating Atlas to see usage, errors, or costs (ties back to `ARCHITECTURE_AUDIT.md` §9, no observability).
- **Legal basics** — no privacy policy, no terms of service, both of which are required by Google's own OAuth verification process for the `gmail.readonly`/`calendar.readonly` scopes to ever leave "unverified app" testing mode with real users.

---

## What this means practically

Read alongside `TECH_DEBT.md`, the honest summary is: **the parts of Atlas that are visible in a demo (UI, animation, navigation, RTL, the chat panel opening) are close to done. The parts that make it a product a second real person could use safely — persistence, multi-tenancy, real write-back to Google services, notifications, and the actual AI-native "background" behavior — have not been started.** `ROADMAP_V2.md` sequences closing these gaps.
