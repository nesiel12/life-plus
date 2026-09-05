"use client";

import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { FileText, UploadCloud, FileAudio, Sparkles, Plus, Link2, Search } from "lucide-react";
import { AiSummaryModal } from "@/components/features/torah/AiSummaryModal";
import { useAtlasStore } from "@/store/useAtlasStore";
import { GlassCard } from "@/components/ui/GlassCard";
import { LearningInsightsHero } from "@/components/features/LearningInsightsHero";
import { KnowledgeLibraryCard } from "@/components/features/KnowledgeLibraryCard";
import { TorahTabs, isCustomTab, type TorahTab } from "@/components/features/torah/TorahTabs";
import { EntityHub } from "@/components/features/torah/EntityHub";
import { AddStudyItem } from "@/components/features/torah/AddStudyItem";
import { StudyItemList } from "@/components/features/torah/StudyItemList";
import { sectionItems } from "@/lib/torah/studyHub";
import { BookCard } from "@/components/features/torah/BookCard";
import { RabbiCard } from "@/components/features/torah/RabbiCard";
import { SummaryCard } from "@/components/features/torah/SummaryCard";
import { SummaryWorkspace } from "@/components/features/summaries/SummaryWorkspace";
import { SectionManager } from "@/components/features/summaries/SectionManager";
import { isFirst, isLast, sorted as sortedByOrder } from "@/lib/summaries/ordering";
import { EditBookModal } from "@/components/features/torah/EditBookModal";
import { EditRabbiModal } from "@/components/features/torah/EditRabbiModal";
import { useApiCall } from "@/hooks/useApiCall";
import { useInsights } from "@/hooks/useInsights";
import { recordRecommendationOutcomeAction } from "@/app/actions/recommendations";
import type { Book, KnowledgeEntry, Rabbi } from "@/types";
import type { LearningInsights } from "@/lib/learning/types";

interface ExtractedShiur {
  fileName: string;
  topic: string;
  source: string;
  summary: string;
  durationMinutes?: number;
}

// Keyword-overlap check against the just-extracted (not-yet-saved) preview —
// distinct from the server-side relatedKnowledge insight (app/api/torah/
// insights), which only exists once an entry is actually saved. Kept as-is:
// real, cheap, client-side, and the one honest way to show "related to
// this" before there's a row to compute server insight against.
function findRelatedSessions(topic: string, entries: KnowledgeEntry[]): KnowledgeEntry[] {
  const topicWords = new Set(topic.split(/\s+/));
  return entries.filter((entry) => entry.topic.split(/\s+/).some((word) => topicWords.has(word)));
}

export default function TorahSpacePage() {
  const [activeTab, setActiveTab] = useState<TorahTab>("shiurim");

  const knowledgeEntries = useAtlasStore((s) => s.knowledgeEntries);
  const addKnowledgeEntry = useAtlasStore((s) => s.addKnowledgeEntry);
  const markKnowledgeReviewed = useAtlasStore((s) => s.markKnowledgeReviewed);
  const [extracted, setExtracted] = useState<ExtractedShiur | null>(null);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Learning Experience v2 (docs/ATLAS_ARCHITECTURE_VISION.md §10): streak,
  // progress, suggested next review, and per-entry related knowledge/memory/
  // goals — fetched client-side on mount via the shared useInsights hook
  // (Atlas Core Optimization v1), the same established pattern AIBriefing/
  // ScheduleSuggestions/Goals Experience v2 already use.
  const {
    data: insights,
    setData: setInsights,
    refresh: refreshInsights,
  } = useInsights<LearningInsights | null>("/api/torah/insights", null, [knowledgeEntries.length]);

  const entryInsightById = useMemo(() => {
    // Both levels optionally chained. `insights?.entries.map(...)` guards
    // only `insights`; if the payload ever arrives without `entries` — a
    // partial response, a shape change, a cached older version — this throws
    // and takes the whole Torah page down behind the error boundary.
    const map = new Map(insights?.entries?.map((e) => [e.entryId, e]) ?? []);
    return map;
  }, [insights]);

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return knowledgeEntries;
    return knowledgeEntries.filter(
      (e) => e.topic.toLowerCase().includes(query) || e.summary.toLowerCase().includes(query)
    );
  }, [knowledgeEntries, search]);

  const {
    loading: processing,
    error: extractError,
    run: extract,
  } = useApiCall(async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/torah/extract", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "עיבוד הקובץ נכשל. נסה שוב.");
    setExtracted({
      fileName: file.name,
      topic: data.topic,
      source: data.source,
      summary: data.summary,
      durationMinutes: data.durationMinutes,
    });
  });

  const { loading: saving, error: saveError, run: save } = useApiCall(addKnowledgeEntry);

  function handleFileSelected(file: File) {
    setExtracted(null);
    extract(file).catch(() => {
      // error is already captured in extractError for display below
    });
  }

  function addExtractedToSeder() {
    if (!extracted) return;
    save({
      date: new Date().toISOString().slice(0, 10),
      topic: extracted.topic,
      source: extracted.source,
      summary: extracted.summary,
      durationMinutes: extracted.durationMinutes,
    })
      .then(() => {
        setExtracted(null);
        refreshInsights();
      })
      .catch(() => {
        // error is already captured in saveError for display below
      });
  }

  // "Accept" the suggested next review *is* marking it reviewed — same
  // reasoning Goals Experience v2 uses for its next action (no separate
  // "I intend to" state), and reuses the exact Server Action calendar
  // suggestions and Goals already call for outcome tracking.
  function handleAcceptNextReview(entryId: string, recommendationEventId: string) {
    markKnowledgeReviewed(entryId).then(refreshInsights);
    recordRecommendationOutcomeAction(recommendationEventId, "accepted").catch((err) => {
      console.error("Failed to record recommendation outcome:", err);
    });
  }

  function handleDismissNextReview(recommendationEventId: string) {
    setInsights((prev) => (prev ? { ...prev, nextReview: null } : prev));
    recordRecommendationOutcomeAction(recommendationEventId, "rejected").catch((err) => {
      console.error("Failed to record recommendation outcome:", err);
    });
  }

  function handleMarkReviewed(entryId: string) {
    markKnowledgeReviewed(entryId).then(refreshInsights);
  }

  const relatedSessions = extracted ? findRelatedSessions(extracted.topic, knowledgeEntries) : [];

  // Books/Rabbis/Summaries: real, DB-backed state (Torah Library Experience
  // v1) — same store-action + useApiCall + "quick-add row + full edit/
  // delete modal" convention the Family page already established for people.
  const books = useAtlasStore((s) => s.books);
  const addBook = useAtlasStore((s) => s.addBook);
  const updateBook = useAtlasStore((s) => s.updateBook);
  const deleteBook = useAtlasStore((s) => s.deleteBook);
  const [newBookTitle, setNewBookTitle] = useState("");
  const [newBookAuthor, setNewBookAuthor] = useState("");
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const { loading: addingBook, error: addBookError, run: createBook } = useApiCall(addBook);
  const { error: saveBookError, run: saveBook } = useApiCall(updateBook);
  const { error: deleteBookError, run: removeBook } = useApiCall(deleteBook);

  const rabbis = useAtlasStore((s) => s.rabbis);
  const addRabbi = useAtlasStore((s) => s.addRabbi);
  const updateRabbi = useAtlasStore((s) => s.updateRabbi);
  const deleteRabbi = useAtlasStore((s) => s.deleteRabbi);
  const [newRabbiName, setNewRabbiName] = useState("");
  const [newRabbiTitle, setNewRabbiTitle] = useState("");
  const [editingRabbi, setEditingRabbi] = useState<Rabbi | null>(null);
  const { loading: addingRabbi, error: addRabbiError, run: createRabbi } = useApiCall(addRabbi);
  const { error: saveRabbiError, run: saveRabbi } = useApiCall(updateRabbi);
  const { error: deleteRabbiError, run: removeRabbi } = useApiCall(deleteRabbi);

  const summaries = useAtlasStore((s) => s.summaries);
  const addSummary = useAtlasStore((s) => s.addSummary);
  const deleteSummary = useAtlasStore((s) => s.deleteSummary);
  const [newSummaryTitle, setNewSummaryTitle] = useState("");
  const [newSummaryContent, setNewSummaryContent] = useState("");
  const [aiSummaryModalOpen, setAiSummaryModalOpen] = useState(false);
  // null = closed; "new" = a fresh summary; any other string = resuming that
  // summary's id. One state rather than an open flag plus an id, so the two
  // cannot disagree about what the editor is showing.
  const [editorTarget, setEditorTarget] = useState<string | null>(null);
  const summarySections = useAtlasStore((s) => s.summarySections);
  const updateSummary = useAtlasStore((s) => s.updateSummary);
  const reorderSummaryInSection = useAtlasStore((s) => s.reorderSummaryInSection);
  // null = the "all" tab.
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  // The book or rabbi whose hub is open. One state for both — the hub
  // component is shared, so the page only needs to know which entity.
  const [openEntity, setOpenEntity] = useState<{ type: "book" | "rabbi"; id: string } | null>(null);
  const [sectionEditorTarget, setSectionEditorTarget] = useState<string | null>(null);
  const addSummarySection = useAtlasStore((s) => s.addSummarySection);
  const { loading: addingSummary, error: addSummaryError, run: createSummary } = useApiCall(addSummary);

  // Filtered by the active tab, then ordered by the user's own arrangement.
  // `orderableSiblings` is the same set reduced to what the ordering helpers
  // need, so the move buttons disable on the real edges of *this* list rather
  // than of every summary.
  const visibleSummaries = useMemo(() => {
    const scoped =
      activeSectionId === null
        ? summaries
        : summaries.filter((s) => (s.sectionId ?? null) === activeSectionId);
    return sortedByOrder(scoped.map((s) => ({ ...s, sortOrder: s.sortOrder ?? 0 })));
  }, [summaries, activeSectionId]);

  const orderableSiblings = useMemo(
    () => visibleSummaries.map((s) => ({ id: s.id, sortOrder: s.sortOrder ?? 0 })),
    [visibleSummaries]
  );
  const { error: deleteSummaryError, run: removeSummary } = useApiCall(deleteSummary);

  function handleAddBook() {
    const title = newBookTitle.trim();
    if (!title) return;
    createBook({ title, author: newBookAuthor.trim() || undefined })
      .then(() => {
        setNewBookTitle("");
        setNewBookAuthor("");
      })
      .catch(() => {
        // error is already captured in addBookError for display below
      });
  }

  function handleSaveBook(id: string, patch: Omit<Book, "id">) {
    saveBook(id, patch).catch(() => {
      // error is already captured in saveBookError for display below
    });
  }

  function handleDeleteBook(id: string) {
    removeBook(id).catch(() => {
      // error is already captured in deleteBookError for display below
    });
  }

  function handleAddRabbi() {
    const name = newRabbiName.trim();
    if (!name) return;
    createRabbi({ name, title: newRabbiTitle.trim() || undefined })
      .then(() => {
        setNewRabbiName("");
        setNewRabbiTitle("");
      })
      .catch(() => {
        // error is already captured in addRabbiError for display below
      });
  }

  function handleSaveRabbi(id: string, patch: Omit<Rabbi, "id">) {
    saveRabbi(id, patch).catch(() => {
      // error is already captured in saveRabbiError for display below
    });
  }

  function handleDeleteRabbi(id: string) {
    removeRabbi(id).catch(() => {
      // error is already captured in deleteRabbiError for display below
    });
  }

  function handleAddSummary() {
    const title = newSummaryTitle.trim();
    const content = newSummaryContent.trim();
    if (!title || !content) return;
    createSummary({ title, content })
      .then(() => {
        setNewSummaryTitle("");
        setNewSummaryContent("");
      })
      .catch(() => {
        // error is already captured in addSummaryError for display below
      });
  }

  function handleDeleteSummary(id: string) {
    removeSummary(id).catch(() => {
      // error is already captured in deleteSummaryError for display below
    });
  }

  return (
    <main className="min-h-screen px-6 py-16 sm:px-10 lg:px-16">
      <h1 className="mb-1 text-2xl font-medium tracking-tight">מרחב תורה</h1>
      <p className="mb-8 text-sm text-muted">הספרייה האישית שלך — ספרים, רבנים, שיעורים וסיכומים, במקום אחד.</p>

      <TorahTabs
        active={activeTab}
        onChange={(tab) => {
          setActiveTab(tab);
          // Leaving a tab closes any open hub, so returning to Books does not
          // land back inside the book the user was last reading.
          setOpenEntity(null);
          setSectionEditorTarget(null);
        }}
        sections={summarySections}
        onAddSection={() => {
          const name = window.prompt("שם המדור החדש");
          if (name?.trim()) addSummarySection({ name: name.trim() }).catch(() => {});
        }}
      />

      {/* The hub takes over the whole tab body when an entity is open — a
          deep-dive is a destination, not a panel beside the list. */}
      {openEntity && (
        <GlassCard>
          <EntityHub
            entityType={openEntity.type}
            entityId={openEntity.id}
            name={
              openEntity.type === "book"
                ? (books.find((b) => b.id === openEntity.id)?.title ?? "")
                : (rabbis.find((r) => r.id === openEntity.id)?.name ?? "")
            }
            subtitle={
              openEntity.type === "book"
                ? books.find((b) => b.id === openEntity.id)?.author
                : rabbis.find((r) => r.id === openEntity.id)?.title
            }
            onBack={() => setOpenEntity(null)}
          />
        </GlassCard>
      )}

      {/* A custom section: mixed study items, ordered by the user. */}
      {!openEntity && isCustomTab(activeTab) && (
        <div className="flex flex-col gap-5">
          {sectionEditorTarget !== null ? (
            <GlassCard>
              <SummaryWorkspace
                existing={
                  sectionEditorTarget === "new"
                    ? undefined
                    : summaries.find((s) => s.id === sectionEditorTarget)
                }
                onClose={() => setSectionEditorTarget(null)}
              />
            </GlassCard>
          ) : (
            <AddStudyItem
              sectionId={activeTab.sectionId}
              onWriteSummary={() => setSectionEditorTarget("new")}
            />
          )}

          <StudyItemList
            items={sectionItems(summaries, activeTab.sectionId)}
            onDelete={handleDeleteSummary}
            onEdit={(id) => setSectionEditorTarget(id)}
            onMove={(id, delta) => reorderSummaryInSection(id, delta).catch(() => {})}
            emptyLabel="המדור הזה עדיין ריק. הוסף סיכום, שיעור וידאו או מקור."
          />
        </div>
      )}

      {!openEntity && activeTab === "books" && (
        <div className="flex flex-col gap-6">
          <div className="flex max-w-xl flex-col gap-2 sm:flex-row">
            <input
              value={newBookTitle}
              onChange={(e) => setNewBookTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddBook()}
              placeholder="שם ספר, למשל: משנה ברורה"
              aria-label="שם הספר החדש"
              className="focus-ring flex-1 rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted"
            />
            <input
              value={newBookAuthor}
              onChange={(e) => setNewBookAuthor(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddBook()}
              placeholder="מחבר (לא חובה)"
              aria-label="מחבר הספר"
              className="focus-ring rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted sm:w-48"
            />
            <button
              onClick={handleAddBook}
              disabled={!newBookTitle.trim() || addingBook}
              className="focus-ring flex items-center justify-center gap-1 rounded-lg bg-accent-faith/20 px-3 py-2 text-sm text-accent-faith transition-opacity disabled:opacity-40"
            >
              <Plus size={14} />
              {addingBook ? "מוסיף…" : "הוסף ספר"}
            </button>
          </div>

          {(addBookError || saveBookError || deleteBookError) && (
            <p className="text-xs text-accent-family">{addBookError ?? saveBookError ?? deleteBookError}</p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {books.map((book, i) => (
              <BookCard
                key={book.id}
                book={book}
                delay={Math.min(i * 0.06, 0.3)}
                onEdit={setEditingBook}
                // Clicking a book now lands in its hub — all its summaries,
                // lessons and sources in one place — rather than a metadata
                // modal. The modal remains reachable from the edit action.
                onOpenProfile={(b) => setOpenEntity({ type: "book", id: b.id })}
              />
            ))}
          </div>
          {books.length === 0 && <p className="text-sm text-muted">הספרייה שלך עדיין ריקה. הוסף את הספר הראשון למעלה.</p>}

          <EditBookModal
            book={editingBook}
            onClose={() => setEditingBook(null)}
            onSave={handleSaveBook}
            onDelete={handleDeleteBook}
          />
        </div>
      )}

      {!openEntity && activeTab === "rabbis" && (
        <div className="flex flex-col gap-6">
          <div className="flex max-w-xl flex-col gap-2 sm:flex-row">
            <input
              value={newRabbiName}
              onChange={(e) => setNewRabbiName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddRabbi()}
              placeholder="שם הרב"
              aria-label="שם הרב החדש"
              className="focus-ring flex-1 rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted"
            />
            <input
              value={newRabbiTitle}
              onChange={(e) => setNewRabbiTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddRabbi()}
              placeholder="תפקיד / קהילה (לא חובה)"
              aria-label="תפקיד או קהילה של הרב"
              className="focus-ring rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted sm:w-48"
            />
            <button
              onClick={handleAddRabbi}
              disabled={!newRabbiName.trim() || addingRabbi}
              className="focus-ring flex items-center justify-center gap-1 rounded-lg bg-accent-faith/20 px-3 py-2 text-sm text-accent-faith transition-opacity disabled:opacity-40"
            >
              <Plus size={14} />
              {addingRabbi ? "מוסיף…" : "הוסף רב"}
            </button>
          </div>

          {(addRabbiError || saveRabbiError || deleteRabbiError) && (
            <p className="text-xs text-accent-family">{addRabbiError ?? saveRabbiError ?? deleteRabbiError}</p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rabbis.map((rabbi, i) => (
              <RabbiCard
                key={rabbi.id}
                rabbi={rabbi}
                delay={Math.min(i * 0.06, 0.3)}
                onEdit={setEditingRabbi}
                onOpenProfile={(r) => setOpenEntity({ type: "rabbi", id: r.id })}
              />
            ))}
          </div>
          {rabbis.length === 0 && <p className="text-sm text-muted">עדיין לא הוספת רבנים. הוסף את הראשון למעלה.</p>}

          <EditRabbiModal
            rabbi={editingRabbi}
            onClose={() => setEditingRabbi(null)}
            onSave={handleSaveRabbi}
            onDelete={handleDeleteRabbi}
          />
        </div>
      )}

      {!openEntity && activeTab === "shiurim" && (
        <div className="flex flex-col gap-6">
          <LearningInsightsHero
            insights={insights}
            onAcceptNextReview={handleAcceptNextReview}
            onDismissNextReview={handleDismissNextReview}
          />

          <GlassCard delay={0.05}>
            <p className="mb-4 text-sm font-medium text-muted">העלאת שיעור (אודיו / PDF)</p>

            <input
              ref={inputRef}
              type="file"
              accept="audio/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelected(file);
              }}
            />

            <button
              onClick={() => inputRef.current?.click()}
              disabled={processing}
              className="focus-ring flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-glass-border py-8 text-muted transition-colors hover:text-foreground disabled:opacity-40"
            >
              <UploadCloud size={24} aria-hidden />
              <span className="text-sm">גרור קובץ או לחץ לבחירה</span>
            </button>

            {extractError && <p className="mt-3 text-xs text-accent-family">{extractError}</p>}

            {processing && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ ease: "easeOut" }}
                className="mt-4 flex items-center gap-2 text-sm text-accent-knowledge"
              >
                <Sparkles size={16} className="animate-pulse" aria-hidden />
                מחלץ נושאים ומקורות…
              </motion.div>
            )}

            {extracted && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ease: "easeOut" }}
                className="mt-4 rounded-xl bg-fill-subtle p-4 text-sm"
              >
                <div className="mb-2 flex items-center gap-2 text-foreground/90">
                  <FileAudio size={16} className="text-accent-knowledge" aria-hidden />
                  {extracted.fileName}
                </div>
                <p>
                  <span className="text-muted">נושא: </span>
                  {extracted.topic}
                </p>
                <p>
                  <span className="text-muted">מקור: </span>
                  {extracted.source}
                </p>
                <p className="mb-3 text-foreground/70">
                  {extracted.summary}
                  {extracted.durationMinutes ? ` · ${extracted.durationMinutes} דק'` : ""}
                </p>

                {relatedSessions.length > 0 && (
                  <div className="mb-3 rounded-lg bg-fill-subtle p-3">
                    <p className="mb-1 flex items-center gap-1 text-xs text-muted">
                      <Link2 size={12} aria-hidden />
                      קשור לשיעורים קודמים
                    </p>
                    {relatedSessions.map((s) => (
                      <p key={s.id} className="text-xs text-foreground/70">
                        {s.topic} · {s.date}
                      </p>
                    ))}
                  </div>
                )}

                <button
                  onClick={addExtractedToSeder}
                  disabled={saving}
                  className="focus-ring flex items-center gap-1 rounded-lg bg-accent-faith/20 px-3 py-1.5 text-xs text-accent-faith disabled:opacity-40"
                >
                  <Plus size={14} aria-hidden />
                  {saving ? "שומר…" : "הוסף לספרייה"}
                </button>
                {saveError && <p className="mt-2 text-xs text-accent-family">{saveError}</p>}
              </motion.div>
            )}
          </GlassCard>

          <div className="relative">
            <Search size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש בספריית הידע…"
              aria-label="חיפוש בספריית הידע"
              className="focus-ring w-full rounded-lg bg-fill-subtle py-2 pe-9 ps-3 text-sm text-foreground placeholder:text-muted"
            />
          </div>

          <div className="flex flex-col gap-4">
            {filteredEntries.map((entry, i) => (
              <KnowledgeLibraryCard
                key={entry.id}
                entry={entry}
                insight={entryInsightById.get(entry.id)}
                delay={Math.min(i * 0.05, 0.5)}
                onMarkReviewed={() => handleMarkReviewed(entry.id)}
              />
            ))}
            {filteredEntries.length === 0 && knowledgeEntries.length > 0 && (
              <p className="text-sm text-muted">אין תוצאות בספרייה עבור החיפוש הזה.</p>
            )}
            {knowledgeEntries.length === 0 && (
              <p className="text-sm text-muted">אין עדיין שיעורים בספרייה. העלה קובץ כדי להתחיל.</p>
            )}
          </div>
        </div>
      )}

      {!openEntity && activeTab === "summaries" && (
        <div className="flex flex-col gap-6">
          <GlassCard delay={0} className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
                <Sparkles size={15} className="text-accent-faith" aria-hidden />
                סיכום שיעור עם AI
              </p>
              <p className="text-xs text-muted">הדבק טקסט או תמלול גולמי, וקבל כותרת, תקציר, נקודות מפתח ומקורות — מוכנים לעריכה.</p>
            </div>
            <button
              onClick={() => setAiSummaryModalOpen(true)}
              className="focus-ring flex shrink-0 items-center gap-1.5 rounded-lg bg-accent-faith/20 px-4 py-2 text-sm font-medium text-accent-faith transition-opacity hover:opacity-80"
            >
              <Sparkles size={14} aria-hidden />
              סיכום AI חדש
            </button>
          </GlassCard>

          <AiSummaryModal open={aiSummaryModalOpen} onClose={() => setAiSummaryModalOpen(false)} onSave={addSummary} />

          <GlassCard delay={0.05}>
            <p className="mb-4 text-sm font-medium text-muted">כתיבת סיכום חדש</p>
            <div className="flex flex-col gap-2">
              <input
                value={newSummaryTitle}
                onChange={(e) => setNewSummaryTitle(e.target.value)}
                placeholder="כותרת הסיכום"
                aria-label="כותרת הסיכום"
                className="focus-ring rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted"
              />
              <textarea
                value={newSummaryContent}
                onChange={(e) => setNewSummaryContent(e.target.value)}
                placeholder="תוכן הסיכום…"
                aria-label="תוכן הסיכום"
                rows={4}
                className="focus-ring resize-none rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted"
              />
              <button
                onClick={handleAddSummary}
                disabled={!newSummaryTitle.trim() || !newSummaryContent.trim() || addingSummary}
                className="focus-ring flex w-fit items-center gap-1 rounded-lg bg-accent-faith/20 px-3 py-1.5 text-xs text-accent-faith disabled:opacity-40"
              >
                <Plus size={14} aria-hidden />
                {addingSummary ? "שומר…" : "שמור סיכום"}
              </button>
              {(addSummaryError || deleteSummaryError) && (
                <p className="text-xs text-accent-family">{addSummaryError ?? deleteSummaryError}</p>
              )}
            </div>
          </GlassCard>

          {editorTarget !== null ? (
            <GlassCard>
              <SummaryWorkspace
                existing={editorTarget === "new" ? undefined : summaries.find((s) => s.id === editorTarget)}
                onClose={() => setEditorTarget(null)}
              />
            </GlassCard>
          ) : (
            <button
              onClick={() => setEditorTarget("new")}
              className="glass-control focus-ring flex w-fit items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-foreground"
            >
              <FileText size={14} className="text-accent-knowledge" aria-hidden />
              כתוב סיכום מלא בעורך
            </button>
          )}

          <SectionManager activeSectionId={activeSectionId} onSelect={setActiveSectionId} />

          <div className="flex flex-col gap-4">
            {visibleSummaries.map((s, i) => (
              <SummaryCard
                key={s.id}
                summary={s}
                delay={Math.min(i * 0.05, 0.5)}
                onDelete={handleDeleteSummary}
                onEdit={(id) => setEditorTarget(id)}
                sections={summarySections}
                onAssignSection={(id, sectionId) =>
                  updateSummary(id, { sectionId: sectionId ?? undefined }).catch(() => {})
                }
                onMove={(id, delta) => reorderSummaryInSection(id, delta).catch(() => {})}
                canMoveUp={!isFirst(orderableSiblings, s.id)}
                canMoveDown={!isLast(orderableSiblings, s.id)}
              />
            ))}
            {visibleSummaries.length === 0 && (
              <p className="text-sm text-muted">
                {activeSectionId === null
                  ? "אין עדיין סיכומים. כתוב את הראשון למעלה."
                  : "אין סיכומים במדור הזה עדיין."}
              </p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
