"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  BookOpen,
  Camera,
  Check,
  FileText,
  GraduationCap,
  Headphones,
  ImagePlus,
  Loader2,
  NotebookPen,
  ScanLine,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { UNCERTAIN_MARK, type ScanQuality } from "@/lib/torah/handwriting";
import type { LessonSummary } from "@/lib/torah/lessons/types";
import { cn } from "@/lib/utils";

const MAX_PAGES = 4;
const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif";

export type ScanEntityType = "book" | "rabbi" | "lesson" | "note";

export interface ScanTarget {
  type: ScanEntityType;
  id?: string;
  label: string;
}

interface ScanResult {
  id: string;
  markdown: string;
  title: string;
  pageCount: number;
  confidence: number;
  uncertainCount: number;
  uncertainSegments: string[];
  quality: ScanQuality;
  imageUrls: string[];
}

interface HandwritingScannerProps {
  open: boolean;
  onClose: () => void;
  /** Pre-selected binding when opened from a Book, Rabbi or Lesson page. */
  target?: ScanTarget;
  /** Called after the note is filed, with where it landed. */
  onSaved?: (result: { summaryId: string; href: string }) => void;
}

const QUALITY_TONES: Record<ScanQuality["level"], string> = {
  high: "bg-accent-health/12 text-accent-health",
  medium: "bg-gold-soft text-gold-ink",
  low: "bg-accent-family/12 text-accent-family",
};

/**
 * סורק כתב יד — photograph a page of handwriting, get editable Hebrew text.
 *
 * Three steps, and the middle one is the point: the reading is shown NEXT TO
 * the photograph before anything is saved. A model reading handwriting is
 * right most of the time, and the times it is not are invisible in text alone
 * — so the page stays on screen while the learner checks it, unreadable words
 * are marked rather than guessed, and nothing reaches their notes until they
 * press save.
 */
export function HandwritingScanner({ open, onClose, target, onSaved }: HandwritingScannerProps) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const books = useAtlasStore((s) => s.books);
  const rabbis = useAtlasStore((s) => s.rabbis);

  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState<null | "reading" | "saving">(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [title, setTitle] = useState("");
  const [page, setPage] = useState(0);
  const [camera, setCamera] = useState(false);

  const [entityType, setEntityType] = useState<ScanEntityType>(target?.type ?? "note");
  const [entityId, setEntityId] = useState<string | undefined>(target?.id);
  const [lessons, setLessons] = useState<LessonSummary[] | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);

  // Object URLs are the only thing here that leaks if forgotten.
  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  const reset = useCallback(() => {
    setFiles([]);
    setHint("");
    setResult(null);
    setMarkdown("");
    setTitle("");
    setError(null);
    setBusy(null);
    setPage(0);
    setCamera(false);
    setEntityType(target?.type ?? "note");
    setEntityId(target?.id);
  }, [target]);

  useEffect(() => {
    if (open) {
      setEntityType(target?.type ?? "note");
      setEntityId(target?.id);
    }
  }, [open, target]);

  // Lessons are not in the store; fetched once, only if the learner files by lesson.
  useEffect(() => {
    if (entityType !== "lesson" || lessons) return;
    fetch("/api/torah/lessons", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setLessons(Array.isArray(data.lessons) ? data.lessons : []))
      .catch(() => setLessons([]));
  }, [entityType, lessons]);

  function addFiles(incoming: FileList | File[] | null) {
    if (!incoming) return;
    const list = Array.from(incoming).filter((file) => file.type.startsWith("image/"));
    if (list.length === 0) {
      setError("אפשר לצרף רק תמונות (JPG, PNG או WEBP).");
      return;
    }
    setError(null);
    setFiles((prev) => [...prev, ...list].slice(0, MAX_PAGES));
  }

  async function read() {
    if (files.length === 0) return;
    setBusy("reading");
    setError(null);
    try {
      const form = new FormData();
      for (const file of files) form.append("file", file);
      if (hint.trim()) form.append("hint", hint.trim());

      const response = await fetch("/api/torah/scan", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) {
        setError(typeof data.error === "string" ? data.error : "קריאת הדף נכשלה.");
        return;
      }
      setResult(data.scan);
      setMarkdown(data.scan.markdown);
      setTitle(data.scan.title);
    } catch {
      setError("קריאת הדף נכשלה. בדוק את החיבור ונסה שוב.");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!result) return;
    if (entityType !== "note" && !entityId) {
      setError("בחר לאן לשייך את הסיכום.");
      return;
    }
    setBusy("saving");
    setError(null);
    try {
      const response = await fetch(`/api/torah/scan/${result.id}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown, title: title.trim() || undefined, entityType, entityId }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(typeof data.error === "string" ? data.error : "שמירת הסיכום נכשלה.");
        return;
      }
      onSaved?.({ summaryId: data.summaryId, href: data.href });
      reset();
      onClose();
      router.refresh();
    } catch {
      setError("שמירת הסיכום נכשלה. נסה שוב.");
    } finally {
      setBusy(null);
    }
  }

  async function discard() {
    if (result) await fetch(`/api/torah/scan/${result.id}`, { method: "DELETE" }).catch(() => undefined);
    reset();
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="presentation">
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="סורק כתב יד"
        initial={reduceMotion ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl border border-hairline-card bg-background shadow-2xl sm:rounded-3xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-hairline-card px-5 py-3.5">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-accent-knowledge/12 text-accent-knowledge" aria-hidden>
              <ScanLine size={17} />
            </span>
            <div>
              <h2 className="text-base font-semibold text-foreground">סורק כתב יד</h2>
              <p className="text-xs text-muted">
                {result ? "עבור על הקריאה מול הצילום, ואז שמור" : "צלם או העלה דף מכתב היד — ונקרא אותו לטקסט"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void discard()}
            aria-label="סגור"
            className="focus-ring rounded-lg p-1.5 text-muted hover:text-foreground"
          >
            <X size={18} aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {!result ? (
            <div className="flex flex-col gap-4">
              {camera ? (
                <CameraCapture
                  onCapture={(file) => {
                    addFiles([file]);
                    setCamera(false);
                  }}
                  onCancel={() => setCamera(false)}
                  onError={(message) => {
                    setError(message);
                    setCamera(false);
                  }}
                />
              ) : (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    addFiles(e.dataTransfer.files);
                  }}
                  className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-hairline-card bg-surface-sunken/40 px-4 py-8 text-center"
                >
                  <span className="grid size-12 place-items-center rounded-full bg-gold-soft text-gold-ink" aria-hidden>
                    <ImagePlus size={22} />
                  </span>
                  <p className="text-sm text-foreground/85">גרור לכאן צילום של הדף, או בחר איך לצרף</p>
                  <p className="text-xs text-muted">JPG · PNG · WEBP — עד {MAX_PAGES} עמודים, 15MB לעמוד</p>
                  <div className="mt-1 flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInput.current?.click()}
                      className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-hairline-card bg-surface px-3.5 py-1.5 text-xs font-medium text-foreground/85 hover:border-gold-line"
                    >
                      <FileText size={13} aria-hidden />
                      בחר קובץ
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setCamera(true);
                      }}
                      className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-gold px-3.5 py-1.5 text-xs font-medium text-white"
                    >
                      <Camera size={13} aria-hidden />
                      צלם עכשיו
                    </button>
                  </div>
                  <input
                    ref={fileInput}
                    type="file"
                    accept={ACCEPT}
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      addFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </div>
              )}

              {previews.length > 0 && (
                <ul className="flex flex-wrap gap-2.5">
                  {previews.map((url, index) => (
                    <li key={url} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element -- a blob: preview of the user's own photo */}
                      <img src={url} alt={`עמוד ${index + 1}`} className="h-28 w-20 rounded-xl border border-hairline-card object-cover" />
                      <button
                        type="button"
                        onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                        aria-label={`הסר עמוד ${index + 1}`}
                        className="focus-ring absolute -top-1.5 -end-1.5 grid size-6 place-items-center rounded-full bg-foreground text-background"
                      >
                        <X size={12} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {files.length > 0 && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted">רוצה לעזור לקריאה? כתוב על מה הדף (לא חובה)</span>
                  <input
                    value={hint}
                    onChange={(e) => setHint(e.target.value)}
                    maxLength={200}
                    placeholder="למשל: שיעור בהלכות מוקצה, כתב יד של סבא"
                    className="rounded-xl border border-hairline-card bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-gold-line"
                  />
                </label>
              )}

              {error && <p className="text-xs text-accent-family">{error}</p>}
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {/* The page, kept on screen while the text is checked. */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted">הצילום</p>
                  {result.imageUrls.length > 1 && (
                    <div className="flex gap-1">
                      {result.imageUrls.map((_, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => setPage(index)}
                          aria-label={`עמוד ${index + 1}`}
                          aria-pressed={page === index}
                          className={cn(
                            "focus-ring size-6 rounded-md text-[0.7rem]",
                            page === index ? "bg-foreground text-background" : "bg-fill-subtle text-muted"
                          )}
                        >
                          {index + 1}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {result.imageUrls[page] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived URL to the user's own upload
                  <img
                    src={result.imageUrls[page]}
                    alt={`הדף שצולם, עמוד ${page + 1}`}
                    className="max-h-[52vh] w-full rounded-2xl border border-hairline-card bg-surface object-contain"
                  />
                ) : previews[page] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local preview fallback
                  <img src={previews[page]} alt={`הדף שצולם, עמוד ${page + 1}`} className="max-h-[52vh] w-full rounded-2xl border border-hairline-card object-contain" />
                ) : (
                  <p className="rounded-2xl border border-dashed border-hairline-card p-6 text-center text-xs text-muted">
                    הצילום לא נשמר, אבל הטקסט נקרא בהצלחה.
                  </p>
                )}
              </div>

              {/* The reading, editable. */}
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("rounded-full px-2.5 py-0.5 text-[0.7rem] font-medium", QUALITY_TONES[result.quality.level])}>
                    {result.quality.label}
                  </span>
                  <span className="text-[0.7rem] text-muted">{result.pageCount > 1 ? `${result.pageCount} עמודים` : "עמוד אחד"}</span>
                </div>

                {result.quality.hint && (
                  <p className="flex items-start gap-1.5 rounded-xl bg-fill-subtle px-3 py-2 text-xs text-foreground/80">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0 text-gold-ink" aria-hidden />
                    {result.quality.hint}
                  </p>
                )}

                {result.uncertainSegments.length > 0 && (
                  <details className="rounded-xl border border-hairline-card bg-surface px-3 py-2">
                    <summary className="cursor-pointer text-xs text-muted">
                      מילים שלא נקראו ({result.uncertainCount}) — הקשר לבדיקה
                    </summary>
                    <ul className="mt-2 flex flex-col gap-1">
                      {result.uncertainSegments.map((segment, index) => (
                        <li key={index} className="text-xs text-foreground/75">
                          …{segment}…
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted">כותרת הסיכום</span>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={200}
                    className="rounded-xl border border-hairline-card bg-surface px-3 py-2 text-sm font-medium text-foreground outline-none focus:border-gold-line"
                  />
                </label>

                <label className="flex min-h-0 flex-col gap-1.5">
                  <span className="text-xs text-muted">
                    הטקסט שנקרא — אפשר לתקן כאן. {UNCERTAIN_MARK} מסמן מילה שלא נקראה.
                  </span>
                  <textarea
                    value={markdown}
                    onChange={(e) => setMarkdown(e.target.value)}
                    rows={14}
                    dir="rtl"
                    className="min-h-[14rem] resize-y rounded-xl border border-hairline-card bg-surface p-3 text-sm leading-relaxed text-foreground outline-none focus:border-gold-line"
                    aria-label="הטקסט שנקרא מהדף"
                  />
                </label>

                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 text-xs text-muted">לשייך את הסיכום אל</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        { type: "note" as const, label: "הסיכומים שלי", icon: NotebookPen },
                        { type: "book" as const, label: "ספר", icon: BookOpen },
                        { type: "rabbi" as const, label: "רב", icon: GraduationCap },
                        { type: "lesson" as const, label: "שיעור", icon: Headphones },
                      ] as const
                    ).map(({ type, label, icon: Icon }) => (
                      <button
                        key={type}
                        type="button"
                        aria-pressed={entityType === type}
                        onClick={() => {
                          setEntityType(type);
                          setEntityId(target?.type === type ? target.id : undefined);
                        }}
                        className={cn(
                          "focus-ring inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
                          entityType === type
                            ? "border-gold-line bg-gold-soft text-foreground"
                            : "border-hairline-card bg-surface text-foreground/80 hover:border-gold-line"
                        )}
                      >
                        <Icon size={12} aria-hidden />
                        {label}
                      </button>
                    ))}
                  </div>

                  {entityType !== "note" && (
                    <select
                      value={entityId ?? ""}
                      onChange={(e) => setEntityId(e.target.value || undefined)}
                      aria-label="בחר פריט"
                      className="rounded-xl border border-hairline-card bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-gold-line"
                    >
                      <option value="">בחר…</option>
                      {entityType === "book" &&
                        books.map((book) => (
                          <option key={book.id} value={book.id}>
                            {book.title}
                          </option>
                        ))}
                      {entityType === "rabbi" &&
                        rabbis.map((rabbi) => (
                          <option key={rabbi.id} value={rabbi.id}>
                            {rabbi.name}
                          </option>
                        ))}
                      {entityType === "lesson" &&
                        (lessons ?? []).map((lesson) => (
                          <option key={lesson.id} value={lesson.id}>
                            {lesson.title}
                          </option>
                        ))}
                    </select>
                  )}
                </fieldset>

                {error && <p className="text-xs text-accent-family">{error}</p>}
              </div>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline-card px-5 py-3.5">
          {!result ? (
            <>
              <p className="text-[0.7rem] text-muted">הטקסט נקרא מהצילום ויוצג לאישור לפני שמירה.</p>
              <button
                type="button"
                onClick={() => void read()}
                disabled={files.length === 0 || busy === "reading"}
                className="focus-ring inline-flex items-center gap-2 rounded-full bg-gold px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy === "reading" ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Sparkles size={15} aria-hidden />}
                {busy === "reading" ? "קורא את הכתב…" : "קרא את הכתב"}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void discard()}
                className="focus-ring inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs text-muted hover:text-accent-family"
              >
                <Trash2 size={13} aria-hidden />
                בטל את הסריקה
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy === "saving" || markdown.trim().length < 2}
                className="focus-ring inline-flex items-center gap-2 rounded-full bg-gold px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy === "saving" ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Check size={15} aria-hidden />}
                שמור כסיכום
              </button>
            </>
          )}
        </footer>
      </motion.div>
    </div>
  );
}

/** The device camera, for photographing a page without leaving the app. */
function CameraCapture({
  onCapture,
  onCancel,
  onError,
}: {
  onCapture: (file: File) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 } } })
      .then((media) => {
        if (cancelled) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream.current = media;
        if (video.current) {
          video.current.srcObject = media;
          void video.current.play().catch(() => undefined);
        }
        setReady(true);
      })
      .catch((err) => {
        const name = (err as { name?: string }).name;
        onError(
          name === "NotAllowedError"
            ? "הגישה למצלמה נחסמה. אפשר לאשר אותה בהגדרות הדפדפן, או לבחור קובץ."
            : "לא הצלחנו לפתוח את המצלמה. אפשר לבחור קובץ במקום."
        );
      });

    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
    };
  }, [onError]);

  function capture() {
    const element = video.current;
    if (!element) return;
    const canvas = document.createElement("canvas");
    canvas.width = element.videoWidth;
    canvas.height = element.videoHeight;
    canvas.getContext("2d")?.drawImage(element, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          onError("הצילום נכשל. נסה שוב.");
          return;
        }
        onCapture(new File([blob], `page-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-2xl border border-hairline-card bg-ink">
        <video ref={video} playsInline muted className="max-h-[50vh] w-full object-contain" aria-label="תצוגת מצלמה" />
        {!ready && (
          <p className="absolute inset-0 grid place-items-center text-sm text-white/80" role="status">
            פותח מצלמה…
          </p>
        )}
      </div>
      <div className="flex justify-center gap-2">
        <button
          type="button"
          onClick={capture}
          disabled={!ready}
          className="focus-ring inline-flex items-center gap-2 rounded-full bg-gold px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          <Camera size={15} aria-hidden />
          צלם את הדף
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-hairline-card px-3.5 py-2 text-xs text-foreground/85"
        >
          <X size={13} aria-hidden />
          בטל
        </button>
      </div>
    </div>
  );
}

/** The button that opens the scanner, with the page's entity pre-selected. */
export function ScanNoteButton({
  target,
  variant = "quiet",
  label = "סרוק כתב יד",
  className,
  onSaved,
}: {
  target?: ScanTarget;
  variant?: "quiet" | "gold";
  label?: string;
  className?: string;
  onSaved?: (result: { summaryId: string; href: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "focus-ring inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
          variant === "gold"
            ? "bg-gold text-white hover:brightness-105"
            : "border border-hairline-card bg-surface text-foreground/85 hover:border-gold-line",
          className
        )}
      >
        <ScanLine size={13} aria-hidden />
        {label}
      </button>
      <AnimatePresence>
        {open && <HandwritingScanner open={open} onClose={() => setOpen(false)} target={target} onSaved={onSaved} />}
      </AnimatePresence>
    </>
  );
}
