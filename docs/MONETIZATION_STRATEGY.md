# Atlas — Monetization Strategy

> The commercial architecture for turning Atlas into a profitable SaaS. This document is deliberately
> **strategy and sequencing**, not code — see the "When to build this" section for why no billing
> infrastructure exists yet, and shouldn't for a while.

---

## 0. Devil's Advocate audit of "monetize now"

Applying the critique lens the founder asked for, honestly:

- **Market demand / utility:** Atlas today is a well‑architected prototype with **one user, zero
  retention data, and most flagship features still shallow or mocked** (proactive engine half‑built,
  learning upload pipeline absent, calendar write‑back fake, no notifications). There is nothing yet
  whose *absence* would make someone pay. Gating features now gates air.
- **Monetization / value capture:** A paywall converts *demonstrated* value into revenue. With no
  cohort of users who've hit the "I'd be upset if this went away" moment, any tier design is a guess,
  and Stripe scaffolding is dead weight that rots as the product changes underneath it.
- **UX/UI:** An upgrade prompt shown to a user who hasn't yet felt the product work is pure friction —
  it actively *lowers* activation.
- **Technical resilience:** Billing is a permanent liability surface (webhooks, proration, tax,
  refunds, dunning, PCI scope). Adding it before product‑market fit means maintaining it through every
  pivot.

**Conclusion:** the correct monetization work *right now* is (a) design the tier architecture so
feature‑gating is a one‑line check when the time comes, (b) build the three upgrade‑trigger features
deliberately so the paid story is obvious later, and (c) instrument activation/retention so the
"greenlight billing" decision is data‑driven. **Do not build Stripe until M12, and only when the
retention bar below is met.**

---

## 1. Who pays, and why

**Beachhead:** Hebrew‑speaking knowledge workers, students, and religiously‑engaged professionals in
Israel who already juggle Google Calendar + a notes app + WhatsApp + a chavruta/study schedule, and
who feel the friction of *nothing connecting them*. This is a real, underserved wedge — no incumbent
does Hebrew‑first LifeOS with a genuine Torah space.

**The pain worth paying for (ranked):**
1. **"My week runs me instead of me running it."** Proactive scheduling that actually respects energy,
   focus windows, and travel — and reschedules itself when the day slips.
2. **"I consume knowledge and it evaporates."** Upload → summary → flashcards → *resurfaced at the
   right time*, wired into the calendar.
3. **"I lose touch with people who matter."** Relationship CRM that nudges before it's awkward.
4. **"My digital life is out of control."** Screen‑time truth + guidance tied to focus and sleep.

Atlas wins because it does all four *for the same person, connected*. Point tools don't.

---

## 2. Tier architecture (design now, enforce at M12)

Freemium. The free tier must be genuinely useful forever — it's the top of the funnel and the viral
surface — but capped on the dimensions that correlate with "this runs my life."

| | **Atlas Free** | **Atlas Pro** (₪39–49/mo, ₪390/yr) | **Atlas Family** (₪79/mo, up to 5) |
|---|---|---|---|
| Today dashboard, all 10 Areas (manual) | ✅ | ✅ | ✅ |
| Deep Onboarding + Personal DNA | ✅ | ✅ | ✅ |
| Google Calendar **read** + free‑slot view | ✅ | ✅ | ✅ |
| AI Companion chat | 20 msgs/day | Unlimited | Unlimited |
| **Proactive Engine** (daily insight, morning briefing, reminder sweeps) | Daily insight only | ✅ Full | ✅ Full |
| **Calendar write‑back** (accept → real event) + auto‑reschedule | — | ✅ | ✅ |
| **Learning Hub** uploads | 3 / month | Unlimited + video | Unlimited |
| Flashcard/quiz generation + spaced resurfacing | Basic | ✅ Full | ✅ Full |
| **Torah Space** shiur transcription | 2 / month | Unlimited | Unlimited |
| **WhatsApp** two‑way assistant | — | ✅ | ✅ |
| **Second Brain** sync (Obsidian/Notion) | — | ✅ | ✅ |
| Screen‑Time analytics + correlation engine | 7‑day window | Full history | Full history |
| Day/Week summaries | Weekly only | Daily + weekly + trivia | ✅ |
| Life Timeline | Last 12 months | Full multi‑year | Full multi‑year |
| Meeting Coordinator | — | ✅ | ✅ (+ family shared calendars) |
| Data export | ✅ (always — trust) | ✅ | ✅ |

**Pricing rationale:** ₪39–49 sits below "software I have to justify" and at parity with a single
premium note/calendar app, while Atlas replaces several. Annual at ~2 months free is the retention
lever. Family tier exploits the real use case (shared calendars, kids' schedules, spouse relationship
goals) at a margin.

**Never gate:** data export, security, the core capture flow, or anything that would make a free user
feel *trapped* rather than *tempted*. Gating trust kills word of mouth.

---

## 3. The three upgrade triggers (build features around these)

Every Pro feature should map to a moment where the free user has *already felt the value* and hits a
wall at the point of maximum intent:

1. **The reschedule wall.** Free user gets a proactive suggestion ("move gym to 17:00, you have a
   focus block at 15:00") → taps Approve → *"שדרגו כדי ש‑Atlas יבצע את השינוי ביומן"*. They wanted the
   outcome; Pro delivers it. Highest‑converting trigger — build it first.
2. **The knowledge wall.** Free user uploads their 4th PDF this month → sees the summary preview
   blurred with *"3 העלאות החינמיות נוצלו — Pro פותח העלאות ללא הגבלה + כרטיסיות חזרה"*.
3. **The WhatsApp wall.** Free user sees "קבלו את הסיכום היומי ישירות ל‑WhatsApp" as a Pro teaser on
   the notification centre. Low friction, high perceived convenience.

---

## 4. Retention & viral loops (design into the product, not bolted on)

- **The morning briefing is the retention engine.** A genuinely useful, DNA‑personalised
  "here's your day" every morning (email + push + WhatsApp for Pro) is the habit that makes churn feel
  like a loss. This is why M2 is sequenced before monetization.
- **Weekly summary = re‑engagement.** The Sunday dashboard + trivia pulls lapsed users back.
- **Streak‑free consistency.** Habit consistency shown as a calm trend, never a punishing streak —
  matches the brand and avoids the anxiety that drives deletion.
- **Viral surface — the shareable weekly recap.** An opt‑in, beautifully rendered "my week in Atlas"
  card (achievements, learning, no private detail) shareable to WhatsApp status. Each share carries a
  soft install link. Hebrew‑first, so it spreads inside the exact target community.
- **Referral:** one month of Pro for both sides. Introduce only after Pro exists.

---

## 5. Activation & retention instrumentation (build in M2–M3, before any paywall)

Track, per user, privately (no third‑party analytics that leak personal data — this is a trust
product):
- **Activation:** completed onboarding, captured ≥3 items, connected Google Calendar, opened a
  briefing — within 7 days.
- **The "aha" event:** first time a user Approves a proactive suggestion.
- **Retention:** briefing open rate (D7/D14/D30), WAU/MAU, feature‑touch breadth.
- **The greenlight bar for billing (M12):** ≥40% of a signup cohort still opening the weekly summary
  at week 4, and ≥25% having hit at least one "aha" event. Below that, keep building value, not
  paywalls.

---

## 6. When to build the billing infrastructure

**M12, and only after the §5 greenlight bar is met.** When it's time:
- **Provider:** Paddle or Lemon Squeezy (merchant of record — they handle Israeli/EU VAT, invoicing,
  and dunning, which is disproportionate pain to build for a solo product). Stripe only if a
  billing‑ops person exists.
- **Enforcement:** a single `lib/billing/entitlements.ts` → `can(userId, "calendar_writeback")`
  checked at the server‑action / API boundary. The tier→feature map from §2 lives in one file.
- **Schema:** `subscriptions` table (user_id, tier, status, provider_ref, current_period_end); a
  nightly job (already have the Proactive Engine's `job_runs` ledger) reconciles against the provider.
- **Grandfather** every existing user into Pro for 6 months — they're the founding cohort and the
  testimonial source.

---

## 7. What to do this milestone

Nothing in this document requires billing code now. The monetization‑relevant work that *is* in scope:
- Design M2–M6 features so each Pro capability in §2 is a clean, isolated boundary (it mostly already
  is — e.g. calendar write‑back is one route).
- Add the private activation/retention instrumentation (§5) as part of M2's `job_runs`/notifications
  work — a `user_events` table + a weekly rollup job.
- Keep `docs/ATLAS_BIBLE.md` §7 roadmap honest that M12 (SaaS surface + billing) is **gated on the §5
  bar**, not on a calendar date.
