"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  BookMarked,
  BookOpen,
  BookOpenText,
  ChevronLeft,
  Library,
  Loader2,
  MapPin,
  MessageSquareQuote,
  NotebookPen,
  PenLine,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Star,
  Tags,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { EntityHub } from "@/components/features/torah/EntityHub";
import { EditBookModal } from "@/components/features/torah/EditBookModal";
import { BookChat } from "@/components/features/torah/BookChat";
import { ActionPill, PageSection, SectionPlaceholder } from "@/components/features/torah/hub/PageSection";
import { SeferCover } from "@/components/features/torah/hub/SeferCover";
import { StarRating } from "@/components/features/torah/hub/StarRating";
import { InvestigationTrail } from "@/components/features/torah/hub/InvestigationTrail";
import { MediaLessonsSection } from "@/components/features/torah/hub/MediaLessonsSection";
import { AudioLessonsSection } from "@/components/features/torah/hub/AudioLessonsSection";
import { useEnrichment } from "@/components/features/torah/hub/useEnrichment";
import { useTorahEntityNavigation } from "@/components/features/torah/hub/useTorahEntityNavigation";
import { eraLabel, hebrewOnly, hebrewYearLabel, isHebrewText, bookTitleKey } from "@/lib/torah/hebrew";
import { findLibraryBook, rabbiInitials, type ProfileOrigin } from "@/lib/torah/rabbiProfile";
import { googleBooksUrl, priceSearchUrl, sefariaReadUrl } from "@/lib/torah/links";
import { recordTrailVisit } from "@/lib/torah/trail";
import { HavrutaSection } from "@/components/features/torah/havruta/HavrutaSection";
import { AudioAttachmentWidget } from "@/components/features/torah/attachments/AudioAttachmentWidget";
import { ScanNoteButton } from "@/components/features/torah/scan/HandwritingScanner";
import type { Book } from "@/types";

interface ExternalRefs {
  sefaria?: { id?: string; era?: string | null; compositionPlace?: string | null };
  googleBooks?: { id?: string };
}

/**
 * A book's own page — the Book half of the investigation loop.
 *
 * Reads like a sefer's entry in a great library: the cover and identity, what
 * it is and what to know before starting, a chavruta that answers from it with
 * verified sources, the user's own notes (with book names in them linked), the
 * shiurim on it, where to buy it and what people think of it — and its author,
 * one click away, whose page leads on to his other seforim.
 *
 * Everything text-shaped is Hebrew at the source; a book missing its Hebrew
 * description has one written the moment the page opens (useEnrichment).
 */
export function BookPage({ bookId }: { bookId: string }) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const navigateEntity = useTorahEntityNavigation();

  const hydrated = useAtlasStore((s) => s.hydrated);
  const books = useAtlasStore((s) => s.books);
  const rabbis = useAtlasStore((s) => s.rabbis);
  const applyBookPatch = useAtlasStore((s) => s.applyBookPatch);
  const updateBook = useAtlasStore((s) => s.updateBook);
  const deleteBook = useAtlasStore((s) => s.deleteBook);
  const openBookAuthor = useAtlasStore((s) => s.openBookAuthor);
  const openOrCreateBook = useAtlasStore((s) => s.openOrCreateBook);

  const book = useMemo(() => books.find((b) => b.id === bookId) ?? null, [books, bookId]);
  const [editing, setEditing] = useState(false);
  const [openingAuthor, setOpeningAuthor] = useState(false);
  const [authorError, setAuthorError] = useState<string | null>(null);

  const displayTitle = book ? (hebrewOnly(book.hebrewTitle) ?? book.title) : "";
  const hebrewAuthor = hebrewOnly(book?.author);

  useEffect(() => {
    if (book) recordTrailVisit({ type: "book", id: book.id, label: displayTitle });
  }, [book?.id, displayTitle]); // eslint-disable-line react-hooks/exhaustive-deps

  // Missing Hebrew content, or an English description stored before the
  // Hebrew-at-source rule: either way, write it natively now.
  const needsEnrichment = Boolean(
    book &&
      (!isHebrewText(book.description) ||
        !isHebrewText(book.preStudyNotes) ||
        !book.keyTopics?.length ||
        (book.author !== undefined && !isHebrewText(book.author)))
  );

  const enrichment = useEnrichment<{ book?: Book; error?: string }>({
    url: `/api/torah/books/${bookId}/enrich`,
    needed: needsEnrichment,
    key: `book:${bookId}`,
    onResult: (data) => {
      if (data.book) applyBookPatch(data.book);
    },
  });

  const author = book?.authorRabbiId ? rabbis.find((r) => r.id === book.authorRabbiId) : undefined;

  async function openAuthor() {
    if (!book) return;
    if (author) {
      router.push(`/areas/torah/rabbis/${author.id}`);
      return;
    }
    setOpeningAuthor(true);
    setAuthorError(null);
    try {
      const result = await openBookAuthor(book.id);
      if ("rabbi" in result) router.push(`/areas/torah/rabbis/${result.rabbi.id}`);
      else setAuthorError(result.error);
    } catch {
      setAuthorError("פתיחת דף הרב נכשלה. נסה שוב.");
    } finally {
      setOpeningAuthor(false);
    }
  }

  if (!hydrated) return null;

  if (!book) {
    return (
      <main className="min-h-screen px-6 py-16 sm:px-10 lg:px-16">
        <BackLink />
        <SectionPlaceholder icon={BookOpen} title="הספר לא נמצא" body="ייתכן שהוא נמחק מהספרייה.">
          <Link href="/areas/torah" className="focus-ring rounded-full bg-gold px-3 py-1.5 text-xs text-white">
            חזרה לספרייה
          </Link>
        </SectionPlaceholder>
      </main>
    );
  }

  const refs = (book.externalRefs ?? {}) as ExternalRefs;
  const era = eraLabel(refs.sefaria?.era ?? undefined);
  const place = hebrewOnly(refs.sefaria?.compositionPlace ?? undefined);
  const sefariaId = refs.sefaria?.id;
  const googleId = refs.googleBooks?.id;

  return (
    <main className="min-h-screen px-4 py-10 sm:px-10 sm:py-14 lg:px-16">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <BackLink />
        <InvestigationTrail current={{ type: "book", id: book.id }} />
      </div>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <motion.header
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="relative overflow-hidden rounded-3xl border border-hairline-card bg-surface p-5 shadow-[0_24px_60px_-40px_rgba(16,16,20,0.45)] sm:p-8"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,var(--gold-soft),transparent_55%)]"
        />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end">
          <motion.div
            initial={reduceMotion ? false : { rotate: -2, y: 8 }}
            animate={{ rotate: 0, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="self-center sm:self-auto"
          >
            <SeferCover title={displayTitle} coverUrl={book.coverImageUrl} size="xl" caption={hebrewAuthor} />
          </motion.div>

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {(book.category || era) && (
              <p className="text-xs font-medium tracking-wide text-gold-ink">
                {[hebrewOnly(book.category), era].filter(Boolean).join(" · ")}
              </p>
            )}
            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
              {displayTitle}
            </h1>

            {hebrewAuthor ? (
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => void openAuthor()}
                  disabled={openingAuthor}
                  aria-label={`פתח את הדף של ${hebrewAuthor}`}
                  className="focus-ring group flex w-fit items-center gap-2.5 rounded-full border border-hairline-card bg-surface py-1 pe-3 ps-1 text-sm text-foreground transition-colors hover:border-gold-line"
                >
                  <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-gold to-gold-ink text-[0.7rem] font-semibold text-white">
                    {openingAuthor ? <Loader2 size={14} className="animate-spin" aria-hidden /> : rabbiInitials(hebrewAuthor)}
                  </span>
                  <span>
                    <span className="text-muted">מאת </span>
                    <span className="font-medium">{hebrewAuthor}</span>
                  </span>
                  <ChevronLeft
                    size={15}
                    className="text-muted transition-transform group-hover:-translate-x-0.5 group-hover:text-gold-ink"
                    aria-hidden
                  />
                </button>
                {authorError && <p className="text-xs text-accent-family">{authorError}</p>}
              </div>
            ) : (
              <p className="flex items-center gap-1.5 text-sm text-muted">
                <UserRound size={14} aria-hidden />
                {enrichment.running ? "מברר מי חיבר את הספר…" : "המחבר עדיין לא ידוע"}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              {book.publishedYear !== undefined && (
                <MetaChip icon={BookMarked}>
                  {hebrewYearLabel(book.publishedYear)} <span className="ltr tabular-nums">({book.publishedYear})</span>
                </MetaChip>
              )}
              {place && <MetaChip icon={MapPin}>{place}</MetaChip>}
              {book.rating !== undefined && (
                <MetaChip icon={Star}>
                  <span className="ltr tabular-nums">{book.rating.toFixed(1)}</span>
                  {book.ratingsCount !== undefined && <span className="ltr tabular-nums">({book.ratingsCount})</span>}
                </MetaChip>
              )}
              {book.personalRating !== undefined && (
                <MetaChip icon={Star}>
                  הדירוג שלי: <span className="ltr tabular-nums">{book.personalRating}/5</span>
                </MetaChip>
              )}
            </div>

            <div className="mt-1 flex flex-wrap gap-2">
              {sefariaId && (
                <ActionPill icon={BookOpenText} href={sefariaReadUrl(sefariaId)} variant="gold">
                  ללמוד בספריא
                </ActionPill>
              )}
              <ActionPill
                icon={NotebookPen}
                onClick={() => document.getElementById("my-notes")?.scrollIntoView({ behavior: "smooth" })}
              >
                הסיכומים שלי
              </ActionPill>
              <ActionPill
                icon={enrichment.running ? Loader2 : RefreshCw}
                busy={enrichment.running}
                onClick={() => void enrichment.run(true)}
              >
                {enrichment.running ? "מעדכן…" : "רענן פרטים"}
              </ActionPill>
              <ActionPill icon={PenLine} onClick={() => setEditing(true)}>
                עריכה
              </ActionPill>
            </div>
            {enrichment.error && <p className="text-xs text-accent-family">{enrichment.error}</p>}
          </div>
        </div>
      </motion.header>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <PageSection id="about" icon={BookOpen} title="על הספר" tone="faith" delay={0.05}>
            {isHebrewText(book.description) ? (
              <p className="text-[0.95rem] leading-8 text-foreground/85">{book.description}</p>
            ) : enrichment.running ? (
              <WritingSkeleton label="כותב תקציר בעברית…" />
            ) : (
              <SectionPlaceholder
                icon={Sparkles}
                title="עדיין אין תקציר לספר"
                body="התקציר נכתב בעברית ישירות, מתוך הידע התורני על הספר."
              >
                <ActionPill icon={Sparkles} onClick={() => void enrichment.run(true)} variant="gold">
                  כתוב תקציר
                </ActionPill>
              </SectionPlaceholder>
            )}

            {(book.keyTopics?.length ?? 0) > 0 && (
              <div className="mt-5 border-t border-hairline-card pt-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted">
                  <Tags size={12} aria-hidden />
                  נושאים מרכזיים
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {book.keyTopics!.map((topic) => (
                    <li key={topic} className="rounded-full bg-fill-subtle px-3 py-1 text-xs text-foreground/80">
                      {topic}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </PageSection>

          <PageSection
            id="before-learning"
            icon={Sparkles}
            title="כדאי לדעת לפני שמתחילים"
            subtitle="מבנה, רקע נדרש ודרך הלימוד"
            delay={0.1}
          >
            {isHebrewText(book.preStudyNotes) ? (
              <ul className="flex flex-col gap-2.5">
                {studyNoteLines(book.preStudyNotes!).map((line, i) => (
                    <li key={i} className="flex gap-3 text-sm leading-relaxed text-foreground/85">
                      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-gold-soft text-[0.65rem] font-semibold text-gold-ink">
                        {i + 1}
                      </span>
                      {line}
                    </li>
                  ))}
              </ul>
            ) : enrichment.running ? (
              <WritingSkeleton label="מכין הנחיות לפני הלימוד…" />
            ) : (
              <SectionPlaceholder icon={Sparkles} title="עוד לא נכתבו הנחיות" body="לחץ על ״רענן פרטים״ כדי להכין אותן." />
            )}
          </PageSection>

          <BookChat key={book.id} bookId={book.id} bookTitle={displayTitle} delay={0.15} />

          <HavrutaSection key={`havruta-${book.id}`} subjectType="book" subjectId={book.id} subjectTitle={displayTitle} delay={0.18} />

          <AudioAttachmentWidget key={`audio-${book.id}`} entityType="book" entityId={book.id} entityLabel={displayTitle} delay={0.2} />

          <PageSection
            id="my-notes"
            icon={NotebookPen}
            tone="knowledge"
            title="הסיכומים וההערות שלי"
            subtitle="שמות ספרים שתכתוב כאן יהפכו לקישורים לדפים שלהם"
            delay={0.2}
            action={<ScanNoteButton target={{ type: "book", id: book.id, label: displayTitle }} />}
          >
            <EntityHub
              embedded
              entityType="book"
              entityId={book.id}
              name={displayTitle}
              onBack={() => {}}
              onEntityClick={navigateEntity}
              kinds={["summaries", "sources"]}
            />
          </PageSection>
        </div>

        <aside className="grid min-w-0 content-start items-start gap-5 md:grid-cols-2 xl:flex xl:flex-col" aria-label="מידע נוסף על הספר">
          <PurchaseSection book={book} title={displayTitle} author={hebrewAuthor} googleId={googleId} />
          <ReviewsSection book={book} onSave={(patch) => updateBook(book.id, patch)} />
          <AuthorShelfSection
            book={book}
            books={books}
            authorName={hebrewAuthor}
            author={author}
            opening={openingAuthor}
            onOpenAuthor={() => void openAuthor()}
            onOpenWork={async (work) => {
              const opened = await openOrCreateBook({
                title: work.title,
                sefariaTitle: work.sefariaTitle,
                authorRabbiId: author?.id,
                authorOrigin: work.origin,
                authorConfidence: work.confidence,
                authorName: author?.hebrewName ?? author?.name,
              });
              router.push(`/areas/torah/books/${opened.id}`);
            }}
          />
          <AudioLessonsSection entityType="book" entityId={book.id} name={displayTitle} delay={0.2} />
        </aside>
      </div>

      <div className="mt-5">
        <MediaLessonsSection entityType="book" entityId={book.id} name={displayTitle} delay={0.1} />
      </div>

      <EditBookModal
        book={editing ? book : null}
        onClose={() => setEditing(false)}
        onSave={(id, patch) => void updateBook(id, patch).catch(() => {})}
        onDelete={(id) => {
          void deleteBook(id)
            .then(() => router.push("/areas/torah"))
            .catch(() => {});
        }}
      />
    </main>
  );
}

/**
 * The "before you start" notes as list items.
 *
 * One item per line when the text has lines; models do not always honour
 * "each on its own line", so a single paragraph is split at sentence ends
 * instead of rendering as one long numbered item.
 */
function studyNoteLines(notes: string): string[] {
  const clean = (line: string) => line.replace(/^[\s•\-–*\d.)]+/, "").trim();
  const lines = notes.split("\n").map(clean).filter(Boolean);
  if (lines.length > 1) return lines;
  return notes
    .split(/(?<=[.!?])\s+(?=[\u05D0-\u05EA"'״])/)
    .map(clean)
    .filter(Boolean);
}

function BackLink() {
  return (
    <Link
      href="/areas/torah"
      className="focus-ring glass-control-hover inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
    >
      <ArrowRight size={14} aria-hidden />
      מרחב תורה
    </Link>
  );
}

function MetaChip({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-hairline-card bg-surface/70 px-2.5 py-1">
      <Icon size={12} className="text-gold-ink" aria-hidden />
      {children}
    </span>
  );
}

function WritingSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-2.5" role="status">
      <p className="flex items-center gap-2 text-xs text-gold-ink">
        <Sparkles size={13} className="animate-pulse" aria-hidden />
        {label}
      </p>
      {["w-full", "w-11/12", "w-4/5", "w-3/5"].map((width) => (
        <span key={width} className={`h-3 animate-pulse rounded bg-fill ${width}`} aria-hidden />
      ))}
    </div>
  );
}

// ── Purchase ──────────────────────────────────────────────────────────────

function PurchaseSection({
  book,
  title,
  author,
  googleId,
}: {
  book: Book;
  title: string;
  author?: string;
  googleId?: string;
}) {
  return (
    <PageSection id="purchase" icon={ShoppingBag} title="רכישה ומחיר" tone="gold" delay={0.05}>
      <div className="flex items-end justify-between gap-3 rounded-xl bg-surface-sunken/60 p-4">
        <div>
          <p className="text-xs text-muted">מחיר ממוצע</p>
          {book.avgPriceIls !== undefined ? (
            <p className="mt-0.5 text-2xl font-semibold text-foreground">
              <span className="ltr tabular-nums">₪{book.avgPriceIls.toFixed(0)}</span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted">עדיין לא ידוע</p>
          )}
        </div>
        {book.isbn && (
          <p className="text-end text-[0.65rem] text-muted">
            ISBN
            <span className="ltr block tabular-nums text-foreground/70">{book.isbn}</span>
          </p>
        )}
      </div>
      <div className="mt-3 flex flex-col gap-2">
        <PurchaseLink href={priceSearchUrl(title, author)} label="השוואת מחירים בחנויות" />
        {googleId && <PurchaseLink href={googleBooksUrl(googleId)} label="הספר ב-Google Books" />}
      </div>
    </PageSection>
  );
}

function PurchaseLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="focus-ring flex items-center justify-between rounded-xl border border-hairline-card px-3.5 py-2.5 text-sm text-foreground/85 transition-colors hover:border-gold-line hover:text-foreground"
    >
      {label}
      <ChevronLeft size={15} className="text-muted" aria-hidden />
    </a>
  );
}

// ── Ratings, reviews & recommendations ────────────────────────────────────

function ReviewsSection({ book, onSave }: { book: Book; onSave: (patch: Partial<Book>) => Promise<void> }) {
  const [review, setReview] = useState(book.personalReview ?? "");
  const [recommendedBy, setRecommendedBy] = useState(book.recommendedBy ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => setReview(book.personalReview ?? ""), [book.id, book.personalReview]);
  useEffect(() => setRecommendedBy(book.recommendedBy ?? ""), [book.id, book.recommendedBy]);

  const dirty = review !== (book.personalReview ?? "") || recommendedBy !== (book.recommendedBy ?? "");

  async function save(patch: Partial<Book>) {
    setSaving(true);
    setSaved(false);
    try {
      await onSave(patch);
      setSaved(true);
    } catch {
      // The store action surfaces nothing here; leaving `dirty` true keeps
      // the save button visible so the user can retry.
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageSection id="reviews" icon={MessageSquareQuote} title="דירוגים, ביקורות והמלצות" tone="family" delay={0.1}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">דירוג הקוראים</p>
          {book.rating !== undefined ? (
            <span className="flex items-center gap-2">
              <StarRating value={book.rating} label="דירוג הקוראים" size={14} />
              <span className="ltr text-xs tabular-nums text-muted">
                {book.rating.toFixed(1)}
                {book.ratingsCount !== undefined && ` · ${book.ratingsCount}`}
              </span>
            </span>
          ) : (
            <span className="text-xs text-muted">אין עדיין דירוג ציבורי</span>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-hairline-card pt-4">
          <p className="text-xs font-medium text-foreground">הדירוג שלי</p>
          <StarRating
            value={book.personalRating}
            label="הדירוג שלי"
            onChange={(value) => void save({ personalRating: value })}
          />
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-foreground">הביקורת שלי</span>
          <textarea
            value={review}
            onChange={(e) => {
              setReview(e.target.value);
              setSaved(false);
            }}
            rows={3}
            placeholder="מה למדת מהספר? למי היית ממליץ עליו?"
            className="focus-ring resize-none rounded-xl border border-hairline-card bg-surface px-3 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-foreground">מי המליץ לי על הספר</span>
          <input
            value={recommendedBy}
            onChange={(e) => {
              setRecommendedBy(e.target.value);
              setSaved(false);
            }}
            placeholder="למשל: הרב שלי, חברותא מהכולל"
            className="focus-ring rounded-xl border border-hairline-card bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted"
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void save({ personalReview: review.trim(), recommendedBy: recommendedBy.trim() })}
            disabled={!dirty || saving}
            className="focus-ring rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background transition-opacity disabled:opacity-30"
          >
            {saving ? "שומר…" : "שמור"}
          </button>
          {saved && !dirty && <span className="text-xs text-accent-health">נשמר</span>}
        </div>
      </div>
    </PageSection>
  );
}

// ── More by the author ────────────────────────────────────────────────────

interface ShelfWork {
  title: string;
  sefariaTitle?: string;
  year?: number;
  origin: ProfileOrigin;
  confidence: number;
}

function AuthorShelfSection({
  book,
  books,
  author,
  authorName,
  opening,
  onOpenAuthor,
  onOpenWork,
}: {
  book: Book;
  books: Book[];
  author?: { id: string; name: string; hebrewName?: string; works?: ShelfWork[] };
  authorName?: string;
  opening: boolean;
  onOpenAuthor: () => void;
  onOpenWork: (work: ShelfWork) => Promise<void>;
}) {
  const [openingWork, setOpeningWork] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ownKey = bookTitleKey(book.hebrewTitle ?? book.title);

  const works = useMemo(() => {
    if (!author) return [];
    const fromProfile = (author.works ?? []).filter((w) => bookTitleKey(w.title) !== ownKey);
    const fromLibrary = books
      .filter((b) => b.authorRabbiId === author.id && b.id !== book.id)
      .filter((b) => !fromProfile.some((w) => bookTitleKey(w.title) === bookTitleKey(b.hebrewTitle ?? b.title)))
      .map((b): ShelfWork => ({ title: b.hebrewTitle ?? b.title, origin: "user", confidence: 1 }));
    return [...fromLibrary, ...fromProfile].slice(0, 9);
  }, [author, books, book.id, ownKey]);

  return (
    <PageSection
      id="author-shelf"
      icon={Library}
      tone="learning"
      title="ספרים נוספים של המחבר"
      subtitle={authorName ? `מתוך מדף הספרים של ${authorName}` : undefined}
      delay={0.15}
    >
      {!authorName ? (
        <SectionPlaceholder icon={Library} title="המחבר עדיין לא ידוע" body="כשיתברר מי חיבר את הספר, ספריו האחרים יופיעו כאן." />
      ) : works.length === 0 ? (
        <SectionPlaceholder
          icon={Library}
          title={author ? "הפרופיל של הרב עדיין לא הועשר" : "גלה את שאר ספריו"}
          body="בדף הרב תמצא את הביוגרפיה, רבותיו ותלמידיו, ואת כל ספריו — כל אחד מהם פותח דף משלו."
        >
          <ActionPill icon={opening ? Loader2 : ChevronLeft} busy={opening} onClick={onOpenAuthor} variant="gold">
            לדף של {authorName}
          </ActionPill>
        </SectionPlaceholder>
      ) : (
        <>
          <ul className="grid grid-cols-3 gap-3">
            {works.map((work) => {
              const inLibrary = findLibraryBook(work, books);
              const key = bookTitleKey(work.title);
              return (
                <li key={key}>
                  <button
                    type="button"
                    disabled={openingWork !== null}
                    onClick={async () => {
                      setOpeningWork(key);
                      setError(null);
                      try {
                        await onOpenWork(work);
                      } catch {
                        setError("פתיחת הספר נכשלה. נסה שוב.");
                        setOpeningWork(null);
                      }
                    }}
                    className="focus-ring group flex w-full flex-col items-center gap-1.5 rounded-xl p-1 text-center disabled:opacity-60"
                  >
                    <span className="relative transition-transform group-hover:-translate-y-1">
                      <SeferCover title={work.title} coverUrl={inLibrary?.coverImageUrl} size="sm" />
                      {openingWork === key && (
                        <span className="absolute inset-0 grid place-items-center rounded-lg bg-black/40">
                          <Loader2 size={14} className="animate-spin text-white" aria-hidden />
                        </span>
                      )}
                    </span>
                    <span className="line-clamp-2 text-[0.7rem] leading-snug text-foreground/85">{work.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {error && <p className="mt-2 text-xs text-accent-family">{error}</p>}
          {author && (
            <Link
              href={`/areas/torah/rabbis/${author.id}`}
              className="focus-ring mt-4 flex items-center justify-center gap-1 rounded-xl border border-hairline-card py-2 text-xs text-foreground/80 transition-colors hover:border-gold-line"
            >
              כל ספרי המחבר ופרופיל מלא
              <ChevronLeft size={13} aria-hidden />
            </Link>
          )}
        </>
      )}
    </PageSection>
  );
}
