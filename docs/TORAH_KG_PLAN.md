# מרחב תורה — Knowledge Graph & Learning Ecosystem

The build plan for turning מרחב תורה from a library of books, rabbis and summaries into an
interconnected, AI-driven learning system: a smart book hub, a rabbi ecosystem, a
transcribe-and-analyse lessons pipeline, active practice with spaced repetition, and the
system-wide graph features (Havruta, visual map, study tracks, Shabbat export, glossary).

**Status:** Phases 0–5, 7, most of 8, and Phase 9 (handwriting scanner + universal audio) are built and live: foundation, the ספרים hub, the Rabbi
ecosystem + investigation loop, the שיעורים pipeline, "לתרגל", spaced repetition, the AI חברותא with
contradiction detection, the visual knowledge map and "הדפסה לשבת". Phase 6 (command palette extras,
calendar suggestions), study tracks and the glossary are specified and not yet built.
**Prerequisite for everything below:** `npm run db:migrate` — three migrations ship in Phase 0
and nothing in Phases 1+ runs without them.

---

## The architectural decision everything else rests on

A **property graph laid over the existing relational tables**, not a node/edge rewrite of them.

`books`, `rabbis` and `summaries` keep their own tables and their own typed columns, and one
table — `kg_edges` — carries every relationship between them. The reasoning is in the header of
`supabase/migrations/20260916000000_torah_kg_core.sql`; the short version is that a `kg_nodes`
table with a jsonb blob would mean rewriting ~30 existing consumers, would lose every typed
column (a cover URL, a birth year, an ISBN), and would throw away a pattern the codebase already
established in `summaries.entity_type/entity_id` and `lib/summaries/entityRef.ts`.

Recursive questions — a rabbi's chain of transmission, a citation tree — are answered two ways,
deliberately:

| Where | What for | Why there |
|---|---|---|
| `lib/torah/graph.ts` (TypeScript, pure) | Neighbours, subgraph for the map, shortest path | The edge set is already loaded; no round trip, and it is unit-testable against a hand-written array |
| `kg_walk()` (Postgres, `WITH RECURSIVE`) | Deep walks — lineage, citation trees | Returns only the branch asked for instead of shipping the whole graph to Node |

Both are cycle-safe. Real data contains cycles (two rabbis each recorded as the other's teacher,
a sefer and its commentary citing each other) and both implementations have an explicit visited
set with tests/`path` guards pinning the behaviour.

---

## The native-Hebrew rule (2026-09-17)

**Every description, biography and note is Hebrew at the source — never a translation.**

- `lib/torah/hebrew.ts` is the gate: `hebrewOnly()` (Hebrew share of letters ≥ 0.7, Latin *and* other scripts
  count against it) and `hebrewProse()` (also strips foreign-script drift — an Arabic word was observed inside
  otherwise fluent Gemini Hebrew).
- Providers read only Hebrew fields: Sefaria `heTitle`/`heDesc`/`heCategories`/`authors[].he`/`compPlaceString.he`,
  topic `heBio`, Hebrew work titles/descriptions. `enDesc` is never read. Google Books text fields pass only if
  Hebrew. Enforced at parse time (`parseSefariaIndex`, `parseGoogleVolume`) and again in `mergeExternalBooks`.
- When no Hebrew text exists, the enrich routes have the model **write Hebrew natively** from Torah knowledge. The
  prompts (`lib/torah/enrichmentPrompts.ts`) are in Hebrew and contain only Hebrew facts — English is never put in
  front of the model, so it cannot be "translated".
- Rows stored before the rule (e.g. "מסילת ישרים" with an English description/author/category) are repaired on
  the next visit: the Book page treats non-Hebrew fields as missing and auto-runs enrichment once per sitting.

---

## Phase 0 — Foundation ✅ BUILT

### Database (3 migrations, 17 new tables)

`supabase/migrations/20260916000000_torah_kg_core.sql`
- `kg_edges` — the graph. Polymorphic `(type, id)` endpoints, 9 relations, `weight` (0–1
  confidence), `origin` (`user` | `ai` | `import`), `evidence` jsonb. Unique index makes every
  writer idempotent, so re-extraction converges instead of stacking duplicates.
- `books` **+13 columns** — cover, hebrew title, published year, description, pre-study notes,
  `author_rabbi_id`, `external_refs`, price, rating, `last_synced_at`. Additive only; every
  existing reader keeps working.
- `rabbis` **+11 columns** — hebrew name, portrait, birth/death year and place, `locations`
  jsonb timeline, era, bio, `external_refs`.
- `concepts` + `concept_mentions` — the global glossary.
- `kg_walk()` — the recursive traversal function, cycle-guarded via a `path` array.

`supabase/migrations/20260916000001_torah_lessons_pipeline.sql`
- `lessons` — media + an explicit `pending → transcribing → analyzing → ready | failed` state
  machine with a Hebrew `error` column, so a stalled job is never indistinguishable from a
  working one.
- `lesson_transcripts` — one-to-one, separate table (a 90-minute shiur is ~15,000 words and must
  not ride along on every `select` over `lessons`). GIN full-text index using the `simple`
  config — Postgres has no Hebrew stemmer, and the limitation is documented rather than papered
  over with an English one.
- `lesson_segments` — smart timestamps.
- `lesson_sources` — the Sources Panel, with `resolved_book_id` linking a citation into the
  user's own library.

`supabase/migrations/20260916000002_torah_active_learning.sql`
- `learning_chunks`, `practice_questions`, `practice_attempts` (append-only, so progress is
  visible), `srs_cards` + `srs_reviews` (SM-2 state and history), `study_tracks` +
  `study_track_items`, `havruta_threads` + `havruta_messages`, `contradiction_alerts`.

### Pure libraries (tested, no database, no React)

| Module | Contents | Tests |
|---|---|---|
| `lib/torah/graph.ts` | `walk`, `neighbours`, `teacherLineage`, `studentLineage`, `subgraphAround`, `degreeByNode`, `shortestPath` | 31 |
| `lib/torah/srs.ts` | SM-2: `review`, `dueCards`, `masteryTier`, `deckProgress` | 28 |
| `lib/torah/citations.ts` | Gematria parsing, Tanach/Talmud/Halacha citation detection, Sefaria ref building | 28 |
| `lib/torah/normalizeTerm.ts` | Glossary term folding, stop-terms, surface-form preference | — |

### Data access & providers

- `lib/db/kgEdges.ts` — `upsertMany` (idempotent), `listForNode`, `walk` (RPC), `removeAiEdgesFrom`
  (deletes AI-derived edges only, never the user's own).
- `lib/db/lessons.ts` — `lessonsRepo` (+ `setStatus`, which enforces "non-failed clears the
  error"), `lessonTranscriptsRepo`, `lessonSegmentsRepo.replaceForLesson`,
  `lessonSourcesRepo.upsertMany`.
- `lib/db/concepts.ts` — `ensure` (find-or-create against the unique index), `record` (mention +
  recount, never a blind increment).
- `lib/db/srsCards.ts` — `listDue` (uses the partial index), `grade` (delegates the maths to the
  pure module, performs the two writes).
- `lib/torah/sources/providers.ts` — Sefaria (`suggest`, `book`, `text`) + Google Books, with a
  6s timeout, day-long cache, and **null-on-failure everywhere**: a provider outage must degrade
  to "added with the title you typed", never to a failed add.
- `types/database.ts` — all 17 tables, plus a `GraphTable<Row, Required>` helper that derives
  Insert/Update from Row (the alternative was ~700 lines of hand-copied shapes, and hand-copied
  shapes are what `20260831000001_fix_learning_schema_drift.sql` exists to clean up).

---

## Phase 1 — "ספרים" smart hub ✅ BUILT *(brief §1)*

**Backend — as built**
1. `GET /api/torah/books/search?q=` → `suggestBooks()`. Debounced client-side, rate-limited
   (40/min), degrades to an empty dropdown rather than an error.
2. `addBookFromProviderAction` (server action, not a route — the store already calls actions for
   every other book mutation). Re-fetches the provider record server-side rather than trusting the
   client's payload, then merges Sefaria + Google and writes `external_refs`/`last_synced_at`.
   **Best-effort:** if both providers fail the book is still created with the typed title.
3. `POST /api/torah/books/[id]/enrich` → `description` + `pre_study_notes`. Provider description
   wins over the model's when one exists. Cached — both columns populated means no AI call at all;
   `?force=1` to regenerate.
4. `POST /api/torah/books/[id]/ask` → book-scoped Q&A. **Structured, not streamed** (named `ask`,
   not `chat`, for that reason): each returned citation goes through `detectCitations()` +
   `isPlausibleSefariaRef()` and is then fetched from Sefaria, so the panel shows real text rather
   than the model's paraphrase. A `confident` flag marks answers that are general background
   rather than sourced from the sefer.

**Frontend — as built**
- `BookSearchCommand` — one search field replacing the old title+author pair. Rich dropdown
  (cover, title, author, year, category, provider badge), keyboard navigable, with an always-present
  "add what I typed" row as the last option.
- `BookHubHeader` — cover, author chip (wired for Phase 2), year/category/rating/price, provider
  description, pre-study notes, enrich button. Rendered *above* the existing `EntityHub`, which
  still owns the user's own summaries/lessons/sources.
- `BookChat` — the assistant, with suggested openers and per-citation Sefaria links.
- `BookCard` — spine-sized cover with an icon fallback, so the grid stays even.

**Known limitation:** Google Books returns HTTP 429 to anonymous requests from some IPs, and it is
the only source of covers and prices. Set `GOOGLE_BOOKS_API_KEY` to get those fields reliably;
without it Sefaria still supplies title, author, year, category and description.

**Cross-linking (brief §1, last bullet) — built in Phase 1.5** as render-time auto-linking (see below). The
earlier plan said "offer, don't auto-convert" to avoid silently rewriting the user's text; rendering links at
display time satisfies the brief's "auto-converts into a hyperlink" without ever modifying the stored note.

---

## Phase 1.5 — ספרים redesign + Book page ✅ BUILT *(brief §1, 2026-09-17)*

- **Search command center** — `components/features/torah/TorahCommandCenter.tsx` replaces `BookSearchCommand`
  and sits at the top of מרחב תורה. ⌘K / Ctrl+K / "/" to focus; scope pills (הכל / ספרים / רבנים / הסיכומים שלי,
  Tab cycles, default follows the active tab); grouped results — the user's library (instant, client-side),
  Sefaria + Google Books, Sefaria author topics, "add what I typed" actions; empty state shows recent pages and
  catalogue picks. Remote half: `GET /api/torah/search` (books + authors from one Sefaria name call).
- **Book page** — real URL `/areas/torah/books/[id]` (`components/features/torah/book/BookPage.tsx`): hero with
  cover or designed leather spine (`hub/SeferCover.tsx`), author chip → Rabbi page, Hebrew year/era/place chips;
  על הספר + key topics; כדאי לדעת לפני שמתחילים; the book chavruta; my notes (EntityHub, embedded); purchase &
  price (price-comparison search, Google Books link); ratings, personal rating/review/recommended-by (new
  `books` columns); more by the author; audio lessons; YouTube.
- **Book chat** — threaded (sessionStorage per book), follow-ups send the last 3 turns, the user's own summaries
  on the book go into the prompt. Citations are resolved by Sefaria's own name API (`sefariaResolveRef`), title-
  prefixed first, and marked **אומת מול ספריא** only when Sefaria returned the text.
- **Auto-linking** — `lib/torah/autoLink.ts` + `SummaryContent`: book names in notes (library books + the
  curated `seforimCatalog.ts`) render as links, first mention only, with Hebrew prefix letters handled. Render-
  time, never written into the stored note. Catalogue-only titles go through `/areas/torah/open?type=book&title=`,
  which opens or creates the book.
- **Audio** — `summaries.kind` now allows `audio` (hosted-file links, `<audio preload="none">`) until Phase 3.

## Phase 2 — Rabbi ecosystem & the investigation loop ✅ BUILT *(brief §2, 2026-09-17)*

Migration `20260917000000_torah_rabbi_ecosystem.sql` (applied): `rabbis` + historical_context, achievements,
lineage, works, is_contemporary, phone, whatsapp_url, website_url, youtube_channel_url, email, suggested_links;
`books` + key_topics, personal_rating, personal_review, recommended_by, isbn; `summaries.kind` + `audio`.

**The loop.** Book → (author chip) → Rabbi → (bookshelf item / teacher / student) → Book or Rabbi → … Every hop is
*open-or-create* (`lib/torah/library.ts`): match by Sefaria identity, then folded Hebrew name/title
(`rabbiNameKey` strips הרב/רבי/זצ״ל…), insert only if missing, and write the `kg_edges` row the hop revealed
(`authored_by`, `taught_by`) with the claim's origin and confidence. Server actions: `openOrCreateBookAction`,
`openBookAuthorAction`, `openOrCreateRabbiAction`. Pages record an **investigation trail** (`lib/torah/trail.ts`,
sessionStorage) shown as a breadcrumb.

**Design decision — catalogue vs graph.** Teachers, students and works known *about* a rabbi live in
`rabbis.lineage` / `rabbis.works` (jsonb, with origin + confidence); only hops the user actually takes become
rows and edges. Enriching the Chafetz Chaim must not dump forty rabbis and books into the user's tabs.

**Enrichment** — `POST /api/torah/rabbis/[id]/enrich`: Sefaria author topic first (found by stored slug or by
Hebrew name; Hebrew bio, years, era, `taught` links, works via `with_indexes=1`) stored as `origin: import`; then
the model writes the rich Hebrew biography, historical context, achievements, Hebrew places/timeline, and fills
lineage/works Sefaria lacks as `origin: ai` capped at 0.9 confidence. Contact details are **never generated**:
a website/channel the model is sure of goes to `suggested_links` for the user to confirm. Existing library rows
matching lineage/works get `kg_edges`; an AI edge never overwrites a stronger (user/import) one.

**Rabbi page** — `/areas/torah/rabbis/[id]` (`components/features/torah/rabbi/RabbiPage.tsx`): monogram portrait,
era / contemporary / "based on Sefaria" badges, Hebrew lifespan (ה׳תקצ״ט–ה׳תרצ״ג), aliases; תולדות חייו;
רקע היסטורי והישגים; שלשלת המסורה (teachers → rabbi → students; AI entries dashed with "משוער · N%"); מדף
הספרים (each opens/creates its Book page with the author linked); contact & community with inline editing
(tel:, wa.me / chat.whatsapp.com only, youtube.com only, validated) — personal rows hidden for historical figures;
במבט מהיר; תחנות בחייו; my notes; YouTube.

**YouTube** — `GET /api/torah/media` + `hub/MediaLessonsSection.tsx`: saved videos, the recorded channel's latest
uploads via YouTube's keyless channel feed (handle URLs resolved once), and YouTube Data API search when
**`YOUTUBE_API_KEY`** is set. Without a key the section offers Hebrew search links — never invented video ids.

**Tests** — `hebrew.test.ts`, `autoLink.test.ts`, `rabbiProfile.test.ts`, `sources/sefariaAuthors.test.ts`
(author topic + channel feed parsers), `sources/providers.test.ts` (Hebrew-only parse + merge).

**Known limitations**
- Google Books answers anonymous requests with 429 from some IPs; covers and prices need `GOOGLE_BOOKS_API_KEY`.
- The lite Gemini model can still be wrong on facts (e.g. listing an opponent as a student). That is exactly why
  AI lineage/works render as "משוער" with confidence — treat them as leads, not records.

## Phases 3–5 — שיעורים pipeline, "לתרגל", spaced repetition ✅ BUILT *(brief §3–4, 2026-09-17)*

Migration `20260918000000_torah_lessons_phase3.sql` (applied): `lessons` + `progress`, `lease_until`,
`attempts`, `media_mime`, `media_size_bytes`, `summary`, `key_points`, `speaker`, `processed_at`, status
`uploading`; `lesson_transcripts.lines` (timed lines); `lesson_sources` + `sefaria_index`, `he_ref`,
`he_index_title`, `mentions`; `practice_attempts.rubric_results`; `srs_cards.chunk_id`; SQL functions
`claim_lesson_step()` / `list_claimable_lessons()`; private Storage bucket `lesson-media` (50 MB, audio only).

### Transcription — Gemini, not Whisper
`OPENAI_API_KEY` is not configured, so Whisper is unavailable. Gemini reads media directly
(`lib/ai/geminiMedia.ts`, called only through `transcribeMediaWindow` in `lib/ai/service.ts`):
- **Audio**: browser → Supabase Storage via a signed upload URL (never through a function body) → worker
  uploads to the Gemini Files API → transcribed in 10-minute windows by prompt range ("from MM:SS to MM:SS").
- **YouTube**: captions first (`youtube-transcript`, ms/seconds units normalised); no captions → Gemini with
  `videoMetadata` start/end offsets and `MEDIA_RESOLUTION_LOW`, in 4-minute windows. Unclipped, a 40-minute
  video timed out at 120s; clipped to 90s it returned in 30s. Duration comes from the YouTube Data API.
- Quota: one structured unit per window (the per-minute transcription budget was sized for Whisper pricing).
  On quota exhaustion the lesson PAUSES (`progress.pausedUntil`) and resumes by itself — it never fails.

### Background processing — resumable steps under a lease
`lib/torah/lessons/pipeline.ts`: `pending → transcribing (one window per step) → analyzing (model call) →
analyzing/write (Sefaria resolution + writes) → ready`. Each step claims a 5-minute lease atomically
(`claim_lesson_step`), commits its result (the transcript after EVERY window), and releases. A killed worker
loses one step; 3 consecutive failures → `failed` with a Hebrew reason; retry resumes from the saved cursor.
Two drivers, both safe to overlap:
- **`npm run cron -- lesson_pipeline`** (`scripts/cron.ts`; job `lesson_pipeline`, global + self-ledgered;
  also in the `daily`/`sweep` groups and alone as `/api/cron/lessons` for a frequent external scheduler);
- **the lesson page's own polling** — `GET /api/torah/lessons/[id]` runs a step with `next/server` `after()`
  while a lesson is active, so an open page finishes a lesson without waiting for cron.
Tunables: `LESSON_AUDIO_WINDOW_SECONDS`, `LESSON_VIDEO_WINDOW_SECONDS`, `LESSON_PIPELINE_BUDGET_MS`.

### Analysis, smart timestamps, Sources Panel
One Hebrew analysis call → summary, key points, chapters (timestamps from the transcript), cited sources.
Deterministic post-processing (`lib/torah/lessons/analysis.ts`, tested): chapters ordered/merged/started at
0:00; citations collected from BOTH the model and a `detectCitations` sweep of every transcript line, collapsed
by source with a mention count; each resolved by Sefaria's own parser (`sefariaRefInfo`, trying
`referenceVariants`), Hebrew text fetched, and matched to the user's library by Sefaria index or Hebrew title
(re-matched on every read, so a book added later links up). `lesson --quotes--> book` edges written.
Hardening found on real transcripts: canonical-numeral guard (`isCanonicalNumeral` — "דף"/"על" are not
numbers), `דף`/`עמוד` wording, gershayim normalisation (an ASCII `"` in רמב"ם cut a model citation), and a
minimum reference length.

### "לתרגל"
- **Learning chunks** (`buildLearningChunks`): ~8-minute parts cut on chapter boundaries. The lesson page
  pauses playback at the end of an unfinished part and offers practice ("להמשיך להאזין" dismisses).
- **Practice per part** (`POST /api/torah/lessons/[id]/chunks/[chunkId]/practice`, generated once and
  stored): 3 questions — scenario / application / compare — with model answer and weighted rubric, plus 4–6
  flashcards. Model answers are revealed only after answering.
- **Grading** (`POST /api/torah/practice/attempts`): the answer is saved BEFORE grading; score, Hebrew
  feedback and a per-criterion checklist.
- **SRS**: `FlashcardDeck` (3D flip, Space / 1–4, next-review preview computed by the same SM-2 `review()`,
  "שוב" requeues within the session); `/areas/torah/practice` reviews due cards across lessons.
- **Gamification** (`lib/torah/practiceStats.ts`, tested, computed from history — never stored): XP (answer
  score/10, reviews 2/1, completed part 20), levels (0/100/300/600/1000…), streak in the user's time zone,
  mastery tiers and deck progress.

### Pages
`/areas/torah/lessons/[id]` (player — audio or YouTube IFrame API — interactive transcript with follow-along,
search and click-to-seek; summary; chapters; Sources Panel; parts), `/areas/torah/lessons/[id]/practice`,
`/areas/torah/practice`; the שיעורים tab has the uploader (audio drag-and-drop with upload progress, or a
YouTube link; optional book/rabbi link), the lessons list with live status, and the practice overview.

### Verified end-to-end (2026-09-17)
Signed upload → storage → cron job (3 windows + analysis + write in 21s); UI upload → page-driven processing →
ready; caption-less YouTube (Gemini) and captioned YouTube; seek/follow/search on audio and YouTube; practice
generation, grading (score + rubric), SRS grading (good → 1 day, again → 10 min & ease 1.70, easy → ease 2.60),
part completion and XP; delete removes row, chunks, cards, edges and the stored file.

### Not done / known limits
- PDF lessons (`kind: 'pdf'`) are not in the new pipeline; the tab's PDF quick-summary remains the PDF path.
- Supabase free plan caps uploads at 50 MB per file (≈ 90 minutes at 64 kbps).
- Vercel's free cron runs twice a day; for prompt processing without an open page, call
  `/api/cron/lessons` from an external scheduler every few minutes (needs `CRON_SECRET`).
- The existing `knowledge_entries.flashcards` backfill into `srs_cards` (old plan, Phase 5) is not done.

## Phase 6 — Navigation & suggestions *(brief §5)*

1. `CommandPalette` (⌘K / Ctrl+K) — global, over books, rabbis, lessons, summaries, concepts and
   actions ("הוסף ספר…", "פתח שיעורי שבת"). Client-side over loaded store data first; server
   search only for transcripts.
2. Contextual "Add Section" suggestions from the Hebrew calendar — `@hebcal/core` and
   `/api/hebrew-calendar` are already wired, so this reads the upcoming chag and proposes the
   module. Suggestion only, dismissible, never auto-created.

---

## Phase 7 — Havruta, contradictions, visual graph ✅ BUILT *(2026-09-17)*

Migrations `20260919000000_torah_havruta_phase4.sql` + `20260919000001_havruta_message_moves.sql` (applied):
`havruta_threads` + `rabbi` subject type, `insights`, `insights_at`; `havruta_messages.moves`;
`contradiction_alerts` + `left_excerpt`, `right_excerpt`, `kind`, `resolution`; new table
`contradiction_scan_pairs` (the scanner's memory).

### 1. AI חברותא — debate mode

`lib/torah/havruta.ts` (pure, tested) owns the prompts: a sharp, supportive beit-midrash partner, **one or two
challenges per turn**, always handing the turn back with a question, never ruling practical halacha. Three
modes — `debate` (פלפול: counter-arguments, opposing Rishonim/Acharonim, the case where the learner's rule
breaks), `clarify` (בחן את הבנתי: questions and hints, never the answer straight away), `contradiction`
(יישוב סתירה). Every model-facing line is Hebrew, so a reply can never be a translation.

Routes: `POST /api/torah/havruta` (open or reopen a thread on a book / rabbi / lesson / summary / concept /
contradiction), `GET|DELETE /api/torah/havruta/[id]`, `POST /api/torah/havruta/[id]/messages` (one turn),
`POST /api/torah/havruta/[id]/insights` (distil the discussion into up to four Hebrew insights).

**Structured, not streamed**, for the same reason as the book assistant: each citation is resolved by
Sefaria's own parser and its Hebrew text fetched (`lib/torah/verifyCitation.ts`, now shared with
`/api/torah/books/[id]/ask`) before the turn is shown. Verified and unverified references never look alike.
Each assistant turn also carries its **moves** (קושיא / שיטה חולקת / חיזוק / בירור / תירוץ) as badges, so the
learner sees at a glance whether they were challenged or agreed with. The learner's message is saved *before*
the model is called: a quota error must never lose what they wrote.

UI: `HavrutaSection` on the Book, Lesson and Rabbi pages (opens nothing until a mode is picked — a page visit
must not create a thread), the full page `/areas/torah/havruta/[id]`, and `/areas/torah/havruta?type=&id=` for
callers that know a subject but not a thread (the map's inspector).

### 2. Contradiction detection

Split deliberately (`lib/torah/contradictions.ts`, pure, tested): the deterministic half picks the few pairs
worth a model's attention — different book/lesson anchors, shared vocabulary (overlap coefficient, not
Jaccard), both making rulings, each side cut to the sentences that overlap — and the route sends at most 8
pairs in one structured call. Verdicts below 0.6 confidence never become alerts; a nagging feature is a
feature that gets switched off.

Every judged pair is remembered in `contradiction_scan_pairs` by a content fingerprint, so a re-scan costs
nothing until a note actually changes. Alerts insert with `ignoreDuplicates: true` — unlike `kg_edges` —
because an existing row carries the learner's decision (`dismissed` / `resolved`) and a re-scan must never
reset it to `open`.

The "עיון וחברותא" widget on the מרחב תורה hub shows each open alert with both excerpts and three actions:
ליישב עם החברותא (opens a contradiction-mode thread), יישבתי, אין כאן סתירה. It also lists recent discussions
with their insight counts.

### 3. Visual knowledge map — `/areas/torah/map`

`GET /api/torah/graph` → `lib/torah/graphMap.ts` builds nodes (books, rabbis, lessons, concepts) and edges
from **two sources**: `kg_edges`, and the links the relational tables already hold but never wrote as edges
(`books.author_rabbi_id`, `lessons.book_id`/`rabbi_id`, a lesson source matched to a book, a concept mention).
Without the second source, the map of a library that has never run an extraction would be a field of dots.
Where both describe the same link the stronger origin wins (user > import > ai).

Rendering is a hand-rolled SVG canvas over a seeded Fruchterman–Reingold layout (`lib/torah/graphLayout.ts`,
pure and tested), not a graph library: the map is capped at 300 nodes, the layout is ~60 lines, and owning it
means the same library lays out the same way on every visit. The layout is computed **once per load over every
node**; filters only hide, so nothing jumps when a filter changes.

Filters: node type, rabbi era (תנאים → בני זמננו, bucketed from the stored era or the dates), book category,
edge kind, hide-isolated. Search folds gershayim and rabbinic honorifics and smoothly centres and zooms onto a
match (`focusCamera` + an eased camera tween). Clicking a node opens an inspector drawer: preview, connections
worded from that node's side ("חיבר את" vs "נכתב על ידי"), open page, and start an AI Havruta on it. Line
style carries `origin` — solid for user/import, dashed for AI, with the confidence shown in the inspector.

## Phase 8 — Tracks, Shabbat export, glossary *(brief §6)*

1. **Study tracks** — `POST /api/torah/tracks` takes a goal ("משנה ברורה בחצי שנה"), AI breaks it
   into `study_track_items` with due dates; dashboard widget reads the next few. Re-plan on slip
   keeps the user's real cadence from `study_tracks.cadence`. **Not built.**

2. **"הדפסה לשבת"** ✅ **BUILT (2026-09-17)** — `/areas/torah/shabbat-print`, server-rendered, with
   `print.css` and Frank Ruhl Libre. HTML + print, not a PDF library: a fraction of the code, better Hebrew
   typesetting, and "save as PDF" is already one click in the print dialog.

   `lib/torah/shabbatSheet.ts` (pure, tested) decides everything: the week runs Sunday→Shabbat **in the
   learner's own zone** (`zonedMidnight` is DST-safe; the zone comes from `personal_dna.timezone`), the parasha
   and the Hebrew date range come from `@hebcal/core` with niqqud stripped, and each section is capped and
   clipped at a sentence — summaries finished this week, lessons processed this week with their key points,
   Havruta insights, practice questions (scenario first, answers included) and key flashcards (new this week,
   or reviewed this week and still slipping). `?week=-1` prints an earlier week; the offset is clamped to a
   year back and never forward, since a future week is always empty.

   The app chrome is hidden in print by one `contents print:hidden` wrapper in `AppShell`, so the printed page
   is the sheet and nothing else. Page numbers use `@page { @bottom-center { content: counter(page, hebrew) } }`.

3. **Glossary** — a pass over new content with `normalizeTerm` + `isGlossaryWorthy`, then
   `conceptsRepo.ensure` and `conceptMentionsRepo.record`. Concept page aggregates every mention
   with its excerpt and links back to the source. **Not built** — the map already renders concept nodes, so
   the glossary only needs the writer.

### Verified end-to-end (2026-09-17)

Against the live database with a throwaway account (created, exercised, deleted): a contradiction scan over
three notes picked exactly the one related pair, the model called it a halachic contradiction at 0.95
confidence with a correct Hebrew explanation, a re-scan judged nothing again, the contradiction thread's first
turn came back in beit-midrash Hebrew with a Sefaria-verified Rambam citation, the insights distilled to a
חידוש and a יישוב, the map rendered typed nodes with a dashed AI lineage edge and a working inspector, and the
Shabbat sheet printed "גיליון לשבת · פרשת האזינו" with the week's summaries and those insights.

**Known limit:** the lite model can cite a real reference that is not the right one — a wrong siman resolves
and verifies. The Sefaria text is shown under every citation precisely so the learner sees that for themselves.

## Phase 9 — Handwriting scanner & universal audio ✅ BUILT *(2026-09-18)*

Migration `20260920000000_torah_media_scans.sql` (applied): `entity_audio`, `handwriting_scans`,
`claim_audio_step()` / `list_claimable_audio()`, and the private `torah-scans` image bucket.

### 1. סורק כתב יד — a photographed page becomes a note

`POST /api/torah/scan` sends the image(s) to Gemini Vision (`generateStructuredData`'s `images` path,
the same one `/api/ai/extract-image-text` uses) after normalising each through sharp — EXIF applied and
stripped, HEIC converted, bounded to 2600px at q90, which is *more* detail than the printed-text route
keeps, because handwriting needs it.

Everything about the prompt and the answer is in `lib/torah/handwriting.ts` (pure, 41 tests). Its one rule
is that **the module never interprets**: the prompt forbids completing, correcting or expanding ראשי תיבות,
and tells the model to write `[?]` where it cannot read a word instead of guessing. Cleanup is typography
only — gershayim/geresh in their Hebrew characters, one bullet glyph, no model preamble ("הנה הטקסט:"),
no code fences, collapsed blank lines. `scanQuality()` then decides what the learner is told, and the
count of unreadable words **outranks the model's own confidence**: a reading that claims 0.95 while giving
up on six words is not 95% right about that page.

The review step is the point of the feature: the photograph stays on screen beside an editable Markdown
box, with the unreadable spots listed in context, until the learner presses save. Nothing reaches their
notes before that. `POST /api/torah/scan/[id]/save` then files it — book/rabbi through
`summaries.entity_type`, a lesson through a `summary --about--> lesson` edge in `kg_edges` (the summaries
table's entity vocabulary is constrained to book/rabbi/person/topic by 20260905000000, and `kg_edges`
exists exactly for relationships the typed columns cannot carry), or nowhere for a personal note. The
saved HTML comes from `scanMarkdownToHtml`, which escapes the text *before* adding markup — a photographed
page is untrusted input — and emits only tags in `lib/summaries/sanitizeHtml.ts`'s allowlist.

UI: `HandwritingScanner` (drag-drop, file picker, or the device camera via `getUserMedia`, up to 4 pages)
and `ScanNoteButton`, mounted on the Book, Rabbi and Lesson pages with that entity pre-selected, and on the
notes hub. The scan row keeps the model's text, the learner's edited text, the confidence and the page
images, so "did it read this right?" stays answerable months later.

### 2. שמע ותמלול בכל מדור — audio on any entity

`entity_audio` attaches a recording to a book, a rabbi, a lesson, a concept or a note, with the same
polymorphic `(type, id)` convention as `kg_edges`. Files go browser → storage through a signed upload URL
(never through a function body) into the existing private `lesson-media` bucket — same privacy model, same
50 MB cap, same audio-only whitelist, one set of rules instead of two.

**Transcription is on demand.** Attaching costs nothing and is instant; only "תמלל הקלטה זו" spends quota.
`lib/torah/attachments/pipeline.ts` is the worker: resumable steps under a row lease, one ~10-minute
transcription window per step, the transcript committed after every window, quota exhaustion pausing
rather than failing — the same contract as the lessons pipeline, and deliberately a separate worker,
because an attachment produces a transcript and stops there. It has three drivers, all safe to overlap:
the transcribe request's own `after()`, the widget's polling (each poll runs a step), and
`npm run cron -- audio_transcription` (global, self-ledgered, in the `daily` and `sweep` groups).

`AudioAttachmentWidget` is one component used on every surface — Book, Rabbi and Lesson pages, the notes
hub, and the knowledge map's inspector (which is where a *concept* gets a recording, since the glossary
has no page yet). Upload or record in the browser (`MediaRecorder`, whichever container the browser
actually supports), an HTML5 player per recording, live progress while transcribing, and the finished
transcript under that player through the lesson page's own `InteractiveTranscript` — follow-along
highlighting, search and click-to-seek, reused rather than rebuilt.

### Verified end-to-end (2026-09-18)

Against the live database and the real Gemini key, with a throwaway account (created, exercised, deleted):
a 26-second Hebrew recording (macOS `say -v Carmit`) uploaded through the signed URL, transcribed to four
timestamped lines — with "סימן שח" correctly written `סימן ש״ח` — and played back with click-to-seek
jumping to 0:07; a handwriting-style Hebrew page rendered to a canvas and dropped into the real scanner
returned in 10 seconds with the heading as `##`, every line right and every gershayim preserved (it read
`עי׳` as `ע״י` — precisely what the review step is for), saved onto the book as a note with `<h2>`/`<p>`
HTML, and logged with confidence 0.98 and its page image. `npm run cron -- audio_transcription` runs.

**Not exercised:** in-browser recording needs a microphone the Browser pane blocks. The blocked path was
verified instead — it shows "הגישה למיקרופון נחסמה…" and offers file upload, rather than failing silently.

---

## Rules for this build

1. **Never widen the blast radius.** Each phase ships behind its own route and component. Nothing
   in Phases 1–8 edits the dashboard, the hero, the global grid, or any shared layout.
2. **AI output is never trusted structurally.** Gematria, refs and graph edges pass through the
   deterministic validators in `lib/torah/*` before they are stored as fact.
3. **`origin` and `weight` are load-bearing.** An AI guess must never render like a user's own
   knowledge.
4. **Every AI call goes through `lib/ai/service.ts`** — the quota layer (`AiActor`, `chargeQuota`)
   is the only thing standing between this feature set and an unbounded bill.
5. **Every provider call can fail.** Sefaria and Google Books are decorations on the user's own
   library, never a dependency of it.
6. **Pure logic lives in `lib/torah/*` with tests.** Routes orchestrate; they do not compute.
