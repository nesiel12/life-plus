"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, Check, Copy, Loader2, Newspaper, Plus, Quote as QuoteIcon, Search, Sparkles, Trash2, X } from "lucide-react";
import { useLibrary } from "@/components/features/learning/lab/useLibrary";
import { MagneticButton } from "@/components/features/learning/lab/MagneticButton";
import { useLab } from "@/components/features/learning/lab/LabContext";
import { useLabReducedMotion } from "@/components/features/learning/lab/useLabMotion";
import { BOOK_STATUS_LABELS, bookProgressFraction, estimatedDaysToFinish, progressLabel } from "@/lib/learning/books";
import { generateChapterBreakdown } from "@/lib/learning/labClient";
import { normalizeText } from "@/lib/learning/topicSearch";
import type { ChapterBreakdown } from "@/lib/ai/agents/learningLabAgent";
import type { LearningBook, LearningBookKind, LearningBookUnit, LearningTopic } from "@/types";
import { cn } from "@/lib/utils";

interface LibraryTabProps {
  topics: readonly LearningTopic[];
}

/** ספרייה וספרים — the reading shelf and the quotes vault. */
export function LibraryTab({ topics }: LibraryTabProps) {
  const library = useLibrary();
  const [addingBook, setAddingBook] = useState(false);
  const [breakdownFor, setBreakdownFor] = useState<LearningBook | null>(null);

  if (library.loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" aria-hidden />
        טוען את הספרייה…
      </div>
    );
  }

  const books = library.books ?? [];

  return (
    <div className="flex flex-col gap-10">
      <section aria-label="מדף הספרים" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <BookOpen size={16} className="text-accent-learning" aria-hidden />
            המדף שלי
          </h2>
          <MagneticButton
            onClick={() => setAddingBook(true)}
            className="flex items-center gap-1.5 rounded-xl bg-accent-learning/15 px-3 py-1.5 text-xs font-medium text-accent-learning transition-opacity hover:opacity-80"
          >
            <Plus size={13} aria-hidden />
            הוסף ספר / מאמר
          </MagneticButton>
        </div>

        {addingBook && (
          <AddBookForm topics={topics} onAdd={library.addBook} onDone={() => setAddingBook(false)} />
        )}

        {books.length === 0 && !addingBook ? (
          <p className="rounded-2xl border border-dashed border-hairline-card p-8 text-center text-sm text-muted">
            עדיין אין כלום על המדף. הוסף ספר או מאמר כדי להתחיל לעקוב אחרי ההתקדמות שלך.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {books.map((book, i) => (
              <BookCard
                key={book.id}
                book={book}
                delay={Math.min(i * 0.05, 0.3)}
                onUpdate={(patch) => library.updateBook(book.id, patch)}
                onRemove={() => library.removeBook(book.id)}
                onBreakdown={() => setBreakdownFor(book)}
              />
            ))}
          </div>
        )}
      </section>

      <QuotesVault
        books={books}
        quotes={library.quotes ?? []}
        onAdd={library.addQuote}
        onRemove={library.removeQuote}
      />

      {breakdownFor && <ChapterBreakdownModal book={breakdownFor} onClose={() => setBreakdownFor(null)} onSaveQuote={library.addQuote} />}

      {library.error && <p className="text-xs text-accent-family">{library.error}</p>}
    </div>
  );
}

const KIND_LABEL: Record<LearningBookKind, string> = { book: "ספר", article: "מאמר" };
const UNIT_OPTIONS: { value: LearningBookUnit; label: string }[] = [
  { value: "page", label: "עמודים" },
  { value: "chapter", label: "פרקים" },
];

function AddBookForm({
  topics,
  onAdd,
  onDone,
}: {
  topics: readonly LearningTopic[];
  onAdd: ReturnType<typeof useLibrary>["addBook"];
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [kind, setKind] = useState<LearningBookKind>("book");
  const [unitLabel, setUnitLabel] = useState<LearningBookUnit>("page");
  const [totalUnits, setTotalUnits] = useState("");
  const [topicId, setTopicId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reduce = useLabReducedMotion();

  async function submit() {
    if (!title.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onAdd({
        title: title.trim(),
        author: author.trim() || undefined,
        kind,
        unitLabel,
        totalUnits: Number(totalUnits) || 0,
        topicId: topicId || undefined,
      });
      onDone();
    } catch {
      setError("לא הצלחנו להוסיף. נסה שוב.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div initial={reduce ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden rounded-2xl border border-hairline-card bg-surface p-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="שם הספר או המאמר"
          aria-label="שם הספר או המאמר"
          className="focus-ring rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted sm:col-span-2"
          autoFocus
        />
        <input
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="מחבר (לא חובה)"
          aria-label="מחבר"
          className="focus-ring rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted"
        />
        <select
          value={topicId}
          onChange={(e) => setTopicId(e.target.value)}
          aria-label="קשר לנושא לימוד"
          className="focus-ring rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground"
        >
          <option value="">בלי קישור לנושא</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
        <div className="flex gap-1 rounded-lg bg-fill-subtle p-1">
          {(["book", "article"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={cn("flex-1 rounded-md px-2 py-1 text-xs transition-colors", kind === k ? "bg-surface text-foreground shadow-sm" : "text-muted")}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={totalUnits}
            onChange={(e) => setTotalUnits(e.target.value.replace(/\D/g, ""))}
            placeholder="סה״כ"
            aria-label="סך היחידות"
            inputMode="numeric"
            className="focus-ring w-20 rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted"
          />
          <select
            value={unitLabel}
            onChange={(e) => setUnitLabel(e.target.value as LearningBookUnit)}
            aria-label="יחידת מדידה"
            className="focus-ring flex-1 rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground"
          >
            {UNIT_OPTIONS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-accent-family">{error}</p>}
      <div className="mt-3 flex items-center gap-2">
        <MagneticButton
          onClick={() => void submit()}
          disabled={!title.trim() || saving}
          className="flex items-center gap-1.5 rounded-lg bg-accent-learning px-3 py-1.5 text-xs font-semibold text-background transition-opacity disabled:opacity-50"
        >
          {saving ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Plus size={12} aria-hidden />}
          הוסף
        </MagneticButton>
        <button onClick={onDone} className="focus-ring text-xs text-muted hover:text-foreground">
          ביטול
        </button>
      </div>
    </motion.div>
  );
}

function BookCard({
  book,
  delay,
  onUpdate,
  onRemove,
  onBreakdown,
}: {
  book: LearningBook;
  delay: number;
  onUpdate: (patch: Partial<LearningBook>) => Promise<unknown>;
  onRemove: () => Promise<unknown>;
  onBreakdown: () => void;
}) {
  const lab = useLab();
  const reduce = useLabReducedMotion();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const fraction = bookProgressFraction(book);
  const eta = estimatedDaysToFinish(book);

  async function bump(delta: number) {
    const next = Math.max(0, book.progressUnits + delta);
    const wasFinished = book.status === "finished";
    await onUpdate({
      progressUnits: next,
      status: book.totalUnits > 0 && next >= book.totalUnits ? "finished" : next > 0 ? "reading" : book.status,
      startedAt: book.startedAt ?? (next > 0 ? new Date().toISOString() : undefined),
      finishedAt: book.totalUnits > 0 && next >= book.totalUnits ? new Date().toISOString() : undefined,
    });
    const nowFinished = book.totalUnits > 0 && next >= book.totalUnits;
    if (nowFinished && !wasFinished) {
      lab.audio.play("chime");
      lab.celebrate("topic", 0);
    } else {
      lab.audio.play("tick");
    }
  }

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { delay, type: "spring", bounce: 0.2 }}
      className="flex flex-col gap-3 rounded-2xl border border-hairline-card bg-surface p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-sm font-semibold text-foreground">{book.title}</h3>
          {book.author && <p className="truncate text-xs text-muted">{book.author}</p>}
        </div>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", book.status === "finished" ? "bg-accent-health/15 text-accent-health" : "bg-fill-subtle text-muted")}>
          {BOOK_STATUS_LABELS[book.status]}
        </span>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-fill-subtle">
        <motion.div className="h-full origin-right rounded-full bg-accent-learning" initial={false} animate={{ scaleX: fraction }} transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.1, duration: 0.6 }} />
      </div>

      <div className="flex items-center justify-between text-xs text-muted">
        <span>{progressLabel(book)}</span>
        {eta !== null && eta > 0 && <span>עוד כ-{eta} ימים בקצב הנוכחי</span>}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button onClick={() => void bump(book.unitLabel === "page" ? 10 : 1)} className="focus-ring rounded-lg bg-accent-learning/15 px-2.5 py-1 text-xs font-medium text-accent-learning transition-opacity hover:opacity-80">
          +{book.unitLabel === "page" ? 10 : 1}
        </button>
        <button onClick={() => void bump(1)} className="focus-ring rounded-lg bg-fill-subtle px-2.5 py-1 text-xs text-foreground transition-opacity hover:opacity-80">
          +1
        </button>
        <button onClick={onBreakdown} className="focus-ring flex items-center gap-1 rounded-lg bg-fill-subtle px-2.5 py-1 text-xs text-foreground transition-opacity hover:opacity-80">
          <Sparkles size={11} className="text-accent-learning" aria-hidden />
          פירוק פרק AI
        </button>
        {confirmingDelete ? (
          <span className="ms-auto flex items-center gap-1.5 text-[11px]">
            <button onClick={() => void onRemove()} className="rounded-lg bg-accent-family/20 px-2 py-0.5 font-medium text-accent-family">
              מחק
            </button>
            <button onClick={() => setConfirmingDelete(false)} className="text-muted hover:text-foreground">
              ביטול
            </button>
          </span>
        ) : (
          <button onClick={() => setConfirmingDelete(true)} aria-label={`מחק את ${book.title}`} className="focus-ring ms-auto text-muted transition-colors hover:text-accent-family">
            <Trash2 size={13} aria-hidden />
          </button>
        )}
      </div>
    </motion.div>
  );
}

function ChapterBreakdownModal({
  book,
  onClose,
  onSaveQuote,
}: {
  book: LearningBook;
  onClose: () => void;
  onSaveQuote: (input: { bookId: string; text: string }) => Promise<unknown>;
}) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ChapterBreakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedIndex, setSavedIndex] = useState<number | null>(null);
  const reduce = useLabReducedMotion();

  async function run() {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await generateChapterBreakdown(book.title, text.trim()));
    } catch {
      setError("לא הצלחנו לסכם כרגע. נסה שוב.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={`פירוק פרק: ${book.title}`}>
      <motion.div initial={reduce ? false : { opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex max-h-[85vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-2xl bg-surface p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">פירוק פרק AI — {book.title}</h3>
          <button onClick={onClose} aria-label="סגור" className="focus-ring rounded-lg p-1 text-muted hover:text-foreground">
            <X size={16} aria-hidden />
          </button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="הדבק כאן את טקסט הפרק…"
          rows={6}
          className="focus-ring resize-none rounded-lg bg-fill-subtle p-3 text-sm text-foreground placeholder:text-muted"
        />
        <MagneticButton
          onClick={() => void run()}
          disabled={!text.trim() || loading}
          className="flex w-fit items-center gap-1.5 rounded-lg bg-accent-learning px-3 py-1.5 text-xs font-semibold text-background transition-opacity disabled:opacity-50"
        >
          {loading ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Newspaper size={12} aria-hidden />}
          סכם פרק
        </MagneticButton>
        {error && <p className="text-xs text-accent-family">{error}</p>}
        {result && (
          <div className="flex flex-col gap-2 rounded-xl bg-fill-subtle p-3">
            <p className="text-sm leading-relaxed text-foreground">{result.summary}</p>
            <ul className="flex flex-col gap-1.5">
              {result.takeaways.map((t, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-foreground/90">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-accent-learning" />
                  <span className="flex-1">{t}</span>
                  <button
                    onClick={() => {
                      onSaveQuote({ bookId: book.id, text: t }).catch(() => undefined);
                      setSavedIndex(i);
                    }}
                    className="focus-ring shrink-0 text-muted transition-colors hover:text-accent-learning"
                    aria-label="שמור כציטוט"
                  >
                    {savedIndex === i ? <Check size={12} className="text-accent-health" aria-hidden /> : <QuoteIcon size={12} aria-hidden />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function QuotesVault({
  books,
  quotes,
  onAdd,
  onRemove,
}: {
  books: readonly LearningBook[];
  quotes: readonly { id: string; bookId: string; text: string; note?: string; chapterLabel?: string }[];
  onAdd: (input: { bookId: string; text: string; note?: string; chapterLabel?: string }) => Promise<unknown>;
  onRemove: (quoteId: string) => Promise<unknown>;
}) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const bookTitle = useMemo(() => new Map(books.map((b) => [b.id, b.title])), [books]);

  const filtered = useMemo(() => {
    const words = normalizeText(query).split(" ").filter(Boolean);
    if (words.length === 0) return quotes;
    return quotes.filter((q) => {
      const haystack = normalizeText(`${q.text} ${q.note ?? ""} ${bookTitle.get(q.bookId) ?? ""}`);
      return words.every((w) => haystack.includes(w));
    });
  }, [quotes, query, bookTitle]);

  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
    } catch {
      // Clipboard permission denied — nothing else to do.
    }
  }

  return (
    <section aria-label="מאגר ציטוטים מובחרים" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <QuoteIcon size={16} className="text-accent-learning" aria-hidden />
          מאגר ציטוטים
        </h2>
        {books.length > 0 && (
          <MagneticButton
            onClick={() => setAdding((v) => !v)}
            className="flex items-center gap-1.5 rounded-xl bg-accent-learning/15 px-3 py-1.5 text-xs font-medium text-accent-learning transition-opacity hover:opacity-80"
          >
            <Plus size={13} aria-hidden />
            הוסף ציטוט
          </MagneticButton>
        )}
      </div>

      {adding && <AddQuoteForm books={books} onAdd={onAdd} onDone={() => setAdding(false)} />}

      {quotes.length > 0 && (
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חפש בציטוטים…"
            aria-label="חיפוש בציטוטים"
            className="focus-ring w-full rounded-xl bg-fill-subtle py-2 pe-9 ps-3 text-sm text-foreground placeholder:text-muted"
          />
        </div>
      )}

      {quotes.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-hairline-card p-6 text-center text-sm text-muted">עדיין אין ציטוטים שמורים.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((q) => (
            <div key={q.id} className="group flex flex-col gap-2 rounded-2xl border border-hairline-card bg-surface p-4">
              <p className="text-sm leading-relaxed text-foreground">&ldquo;{q.text}&rdquo;</p>
              <p className="text-xs text-muted">
                {bookTitle.get(q.bookId) ?? "ספר לא ידוע"}
                {q.chapterLabel ? ` · ${q.chapterLabel}` : ""}
              </p>
              <div className="mt-auto flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <button onClick={() => void copy(q.text, q.id)} className="focus-ring flex items-center gap-1 rounded-lg bg-fill-subtle px-2 py-1 text-[11px] text-foreground transition-opacity hover:opacity-80">
                  {copiedId === q.id ? <Check size={11} className="text-accent-health" aria-hidden /> : <Copy size={11} aria-hidden />}
                  {copiedId === q.id ? "הועתק" : "העתק"}
                </button>
                <button onClick={() => void onRemove(q.id)} aria-label="מחק ציטוט" className="focus-ring ms-auto text-muted transition-colors hover:text-accent-family">
                  <Trash2 size={12} aria-hidden />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AddQuoteForm({
  books,
  onAdd,
  onDone,
}: {
  books: readonly LearningBook[];
  onAdd: (input: { bookId: string; text: string; note?: string; chapterLabel?: string }) => Promise<unknown>;
  onDone: () => void;
}) {
  const [bookId, setBookId] = useState(books[0]?.id ?? "");
  const [text, setText] = useState("");
  const [chapterLabel, setChapterLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reduce = useLabReducedMotion();

  async function submit() {
    if (!text.trim() || !bookId || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onAdd({ bookId, text: text.trim(), chapterLabel: chapterLabel.trim() || undefined });
      onDone();
    } catch {
      setError("לא הצלחנו לשמור. נסה שוב.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div initial={reduce ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="flex flex-col gap-2 overflow-hidden rounded-2xl border border-hairline-card bg-surface p-4">
      <select value={bookId} onChange={(e) => setBookId(e.target.value)} aria-label="מתוך איזה ספר" className="focus-ring rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground">
        {books.map((b) => (
          <option key={b.id} value={b.id}>
            {b.title}
          </option>
        ))}
      </select>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="הציטוט…"
        rows={3}
        autoFocus
        className="focus-ring resize-none rounded-lg bg-fill-subtle p-3 text-sm text-foreground placeholder:text-muted"
      />
      <input
        value={chapterLabel}
        onChange={(e) => setChapterLabel(e.target.value)}
        placeholder="פרק / עמוד (לא חובה)"
        aria-label="פרק או עמוד"
        className="focus-ring rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted"
      />
      {error && <p className="text-xs text-accent-family">{error}</p>}
      <div className="flex items-center gap-2">
        <MagneticButton
          onClick={() => void submit()}
          disabled={!text.trim() || saving}
          className="flex items-center gap-1.5 rounded-lg bg-accent-learning px-3 py-1.5 text-xs font-semibold text-background transition-opacity disabled:opacity-50"
        >
          {saving ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Plus size={12} aria-hidden />}
          שמור
        </MagneticButton>
        <button onClick={onDone} className="focus-ring text-xs text-muted hover:text-foreground">
          ביטול
        </button>
      </div>
    </motion.div>
  );
}
