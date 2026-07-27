"use client";

import { useMemo, useRef, useState, type DragEvent } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  Check,
  FileAudio,
  FileText,
  GraduationCap,
  Loader2,
  Plus,
  Sparkles,
  SquarePlay,
  UploadCloud,
  X,
} from "lucide-react";
import { Modal, Z_INDEX } from "@/components/ui/Modal";
import { useApiCall } from "@/hooks/useApiCall";
import { useAtlasStore } from "@/store/useAtlasStore";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { normalizeName } from "@/lib/torah/summaryLinks";
import type { Book, Rabbi } from "@/types";

interface AiSummaryDraft {
  title: string;
  tldr: string;
  keyPointsText: string; // one key point per line — simpler editable surface than a dynamic list widget
  suggestedRabbi: string;
  suggestedBooksText: string; // one book/source per line
}

interface RawAiSummary {
  title?: string;
  tldr?: string;
  key_points?: string[];
  suggested_rabbi?: string | null;
  suggested_books?: string[];
}

function draftFromResponse(data: RawAiSummary): AiSummaryDraft {
  return {
    title: data.title ?? "",
    tldr: data.tldr ?? "",
    keyPointsText: Array.isArray(data.key_points) ? data.key_points.join("\n") : "",
    suggestedRabbi: data.suggested_rabbi ?? "",
    suggestedBooksText: Array.isArray(data.suggested_books) ? data.suggested_books.join("\n") : "",
  };
}

// Folds the AI's richer structure (title/tldr/key points/rabbi/books) into
// the plain title+content shape summaries.content already persists as —
// no schema change needed, addSummary stays exactly what it was for the
// manual composer.
function buildContent(draft: AiSummaryDraft): string {
  const keyPoints = draft.keyPointsText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const books = draft.suggestedBooksText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const sections: string[] = [];
  if (draft.tldr.trim()) sections.push(draft.tldr.trim());
  if (keyPoints.length > 0) sections.push(["נקודות מפתח:", ...keyPoints.map((p) => `• ${p}`)].join("\n"));
  if (draft.suggestedRabbi.trim()) sections.push(`רב: ${draft.suggestedRabbi.trim()}`);
  if (books.length > 0) sections.push(`מקורות: ${books.join(", ")}`);

  return sections.join("\n\n");
}

interface AiSummaryModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (summary: { title: string; content: string }) => Promise<void>;
}

// The Summaries tab's "New AI Summary" flow (Torah Space AI Summarizer):
// paste raw shiur text -> POST /api/ai/summarize-shiur -> review/edit the
// structured result -> save through the exact same addSummary action the
// manual composer already uses. Two steps in one modal rather than two
// separate modals, since the review step is a direct continuation of the
// same task, not a new one.
export function AiSummaryModal({ open, onClose, onSave }: AiSummaryModalProps) {
  const [step, setStep] = useState<"input" | "review">("input");
  const [inputMode, setInputMode] = useState<"text" | "youtube" | "audio">("text");
  const [rawText, setRawText] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [loadingPhase, setLoadingPhase] = useState<"transcript" | "audio" | "summarizing" | null>(null);
  const [draft, setDraft] = useState<AiSummaryDraft | null>(null);

  // Entity linking (Torah Library Experience v1's Books/Rabbis) — matched
  // reactively against the live store, not frozen at the moment the AI
  // responded, so editing the name field or creating an entity below
  // immediately flips its chip from "new" to "existing" with no separate
  // tracking flag to keep in sync.
  const rabbis = useAtlasStore((s) => s.rabbis);
  const books = useAtlasStore((s) => s.books);
  const addRabbi = useAtlasStore((s) => s.addRabbi);
  const addBook = useAtlasStore((s) => s.addBook);
  const [creatingRabbi, setCreatingRabbi] = useState(false);
  const [creatingBookName, setCreatingBookName] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  const rabbiName = draft?.suggestedRabbi.trim() ?? "";
  const matchedRabbi = useMemo<Rabbi | null>(
    () => (rabbiName ? (rabbis.find((r) => normalizeName(r.name) === normalizeName(rabbiName)) ?? null) : null),
    [rabbiName, rabbis]
  );

  const bookNames = useMemo(
    () =>
      (draft?.suggestedBooksText ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    [draft?.suggestedBooksText]
  );

  function matchedBookFor(name: string): Book | null {
    return books.find((b) => normalizeName(b.title) === normalizeName(name)) ?? null;
  }

  async function handleCreateRabbi() {
    if (!rabbiName || creatingRabbi) return;
    setCreatingRabbi(true);
    setLinkError(null);
    try {
      await addRabbi({ name: rabbiName });
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "יצירת הרב נכשלה.");
    } finally {
      setCreatingRabbi(false);
    }
  }

  async function handleCreateBook(title: string) {
    if (creatingBookName) return;
    setCreatingBookName(title);
    setLinkError(null);
    try {
      await addBook({ title });
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "יצירת הספר נכשלה.");
    } finally {
      setCreatingBookName(null);
    }
  }

  const {
    loading: summarizing,
    error: summarizeError,
    run: summarize,
  } = useApiCall(async () => {
    setLoadingPhase(inputMode === "youtube" ? "transcript" : inputMode === "audio" ? "audio" : "summarizing");

    let textToSummarize = rawText;

    if (inputMode === "youtube") {
      const transcriptRes = await fetch("/api/ai/fetch-youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: youtubeUrl }),
      });
      const transcriptData = await transcriptRes.json();
      if (!transcriptRes.ok) throw new Error(transcriptData.error ?? "שליפת התמלול מהסרטון נכשלה.");
      textToSummarize = transcriptData.text;
      setLoadingPhase("summarizing");
    } else if (inputMode === "audio") {
      if (!audioFile) throw new Error("יש לבחור קובץ שמע.");
      const formData = new FormData();
      formData.append("file", audioFile);
      const transcribeRes = await fetch("/api/ai/transcribe-audio", { method: "POST", body: formData });
      const transcribeData = await transcribeRes.json();
      if (!transcribeRes.ok) throw new Error(transcribeData.error ?? "תמלול קובץ השמע נכשל.");
      textToSummarize = transcribeData.text;
      setLoadingPhase("summarizing");
    }

    const res = await fetch("/api/ai/summarize-shiur", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: textToSummarize }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "יצירת הסיכום נכשלה. נסה שוב.");
    setDraft(draftFromResponse(data));
    setStep("review");
  });

  const { loading: saving, error: saveError, run: save } = useApiCall(async () => {
    if (!draft) return;
    await onSave({ title: draft.title.trim() || "שיעור ללא כותרת", content: buildContent(draft) });
    resetAndClose();
  });

  const busy = summarizing || saving;

  function resetAndClose() {
    setStep("input");
    setInputMode("text");
    setRawText("");
    setYoutubeUrl("");
    setAudioFile(null);
    setLoadingPhase(null);
    setDraft(null);
    setLinkError(null);
    onClose();
  }

  function updateDraft(patch: Partial<AiSummaryDraft>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function handleAudioDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) setAudioFile(file);
  }

  const canSummarize =
    inputMode === "youtube" ? Boolean(youtubeUrl.trim()) : inputMode === "audio" ? Boolean(audioFile) : Boolean(rawText.trim());

  function handleSummarize() {
    if (!canSummarize || summarizing) return;
    summarize().catch(() => {
      // error is already captured in summarizeError for display below
    });
  }

  function handleSave() {
    if (saving) return;
    save().catch(() => {
      // error is already captured in saveError for display below
    });
  }

  return (
    <Modal
      open={open}
      onClose={resetAndClose}
      closeOnBackdropClick={!busy}
      closeOnEscape={!busy}
      zIndex={Z_INDEX.modal}
      panelClassName="flex max-h-[85vh] w-full max-w-2xl flex-col p-0"
    >
      <div className="flex items-center justify-between p-6 pb-4">
        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Sparkles size={15} className="text-accent-faith" aria-hidden />
          סיכום שיעור עם AI
        </p>
        <button
          onClick={resetAndClose}
          disabled={busy}
          aria-label="סגור"
          className="focus-ring rounded-lg p-1.5 text-muted transition-all hover:scale-110 hover:bg-white/5 hover:text-foreground disabled:opacity-40"
        >
          <X size={16} />
        </button>
      </div>

      {/* Scrolls independently of the header/footer, so the action row below
          stays reachable even with a mobile virtual keyboard open and the
          textarea scrolled deep into view. */}
      <div className="flex-1 overflow-y-auto px-6">
        {summarizing && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <motion.div
              animate={{
                boxShadow: [
                  "0 0 20px -6px color-mix(in srgb, var(--accent-faith) 45%, transparent)",
                  "0 0 44px -6px color-mix(in srgb, var(--accent-faith) 75%, transparent)",
                  "0 0 20px -6px color-mix(in srgb, var(--accent-faith) 45%, transparent)",
                ],
              }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="flex size-14 items-center justify-center rounded-full bg-accent-faith/10"
            >
              <Sparkles size={22} className="text-accent-faith" aria-hidden />
            </motion.div>
            <p className="text-sm text-muted">
              {loadingPhase === "transcript"
                ? "שואב תמלול מהסרטון…"
                : loadingPhase === "audio"
                  ? "מעלה ומתמלל את קובץ השמע…"
                  : "מנתח את השיעור ומכין סיכום…"}
            </p>
          </div>
        )}

        {step === "input" && !summarizing && (
          <div className="flex flex-col gap-2 pb-2">
            <div className="inline-flex w-fit rounded-lg bg-white/5 p-1" role="tablist" aria-label="סוג קלט">
              <button
                type="button"
                role="tab"
                aria-selected={inputMode === "text"}
                onClick={() => setInputMode("text")}
                className={cn(
                  "focus-ring flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors",
                  inputMode === "text" ? "bg-accent-faith/20 text-accent-faith" : "text-muted hover:text-foreground"
                )}
              >
                <FileText size={12} aria-hidden />
                טקסט גולמי
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={inputMode === "youtube"}
                onClick={() => setInputMode("youtube")}
                className={cn(
                  "focus-ring flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors",
                  inputMode === "youtube" ? "bg-accent-faith/20 text-accent-faith" : "text-muted hover:text-foreground"
                )}
              >
                <SquarePlay size={12} aria-hidden />
                קישור YouTube
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={inputMode === "audio"}
                onClick={() => setInputMode("audio")}
                className={cn(
                  "focus-ring flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors",
                  inputMode === "audio" ? "bg-accent-faith/20 text-accent-faith" : "text-muted hover:text-foreground"
                )}
              >
                <FileAudio size={12} aria-hidden />
                קובץ שמע
              </button>
            </div>

            {inputMode === "text" ? (
              <>
                <label htmlFor="ai-summary-raw-text" className="text-xs text-muted">
                  הדבק כאן את התמלול או ההערות של השיעור
                </label>
                <textarea
                  id="ai-summary-raw-text"
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="הדבק כאן את הטקסט המלא של השיעור…"
                  rows={12}
                  className="focus-ring min-h-64 resize-y rounded-lg bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted"
                />
              </>
            ) : inputMode === "youtube" ? (
              <>
                <label htmlFor="ai-summary-youtube-url" className="text-xs text-muted">
                  קישור לסרטון YouTube של השיעור
                </label>
                <input
                  id="ai-summary-youtube-url"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=…"
                  className="focus-ring ltr rounded-lg bg-white/5 px-3 py-2 text-start text-sm text-foreground placeholder:text-muted"
                />
                <p className="text-xs text-muted">
                  התמלול/הכתוביות של הסרטון ייטענו אוטומטית ויועברו לסיכום. דורש שלסרטון יש כתוביות זמינות.
                </p>
              </>
            ) : (
              <>
                <label className="text-xs text-muted">{"קובץ שמע של השיעור (mp3, m4a, wav וכו')"}</label>
                <input
                  ref={audioInputRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setAudioFile(file);
                  }}
                />
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleAudioDrop}
                  className="flex flex-col gap-3"
                >
                  <button
                    type="button"
                    onClick={() => audioInputRef.current?.click()}
                    className="focus-ring flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-glass-border py-8 text-muted transition-colors hover:text-foreground"
                  >
                    <UploadCloud size={24} aria-hidden />
                    <span className="text-sm">{audioFile ? "החלף קובץ שמע" : "גרור קובץ שמע לכאן או לחץ לבחירה"}</span>
                  </button>
                  {audioFile && (
                    <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-foreground/90">
                      <FileAudio size={16} className="text-accent-knowledge shrink-0" aria-hidden />
                      <span className="truncate">{audioFile.name}</span>
                    </div>
                  )}
                </div>
              </>
            )}

            {summarizeError && <p className="text-xs text-accent-family">{summarizeError}</p>}
          </div>
        )}

        {step === "review" && draft && !summarizing && (
          <div className="flex flex-col gap-3 pb-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="ai-summary-title" className="text-xs text-muted">
                כותרת
              </label>
              <input
                id="ai-summary-title"
                value={draft.title}
                onChange={(e) => updateDraft({ title: e.target.value })}
                className="focus-ring rounded-lg bg-white/5 px-3 py-2 text-sm text-foreground"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="ai-summary-tldr" className="text-xs text-muted">
                תקציר
              </label>
              <textarea
                id="ai-summary-tldr"
                value={draft.tldr}
                onChange={(e) => updateDraft({ tldr: e.target.value })}
                rows={3}
                className="focus-ring resize-none rounded-lg bg-white/5 px-3 py-2 text-sm text-foreground"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="ai-summary-points" className="text-xs text-muted">
                נקודות מפתח (שורה לכל נקודה)
              </label>
              <textarea
                id="ai-summary-points"
                value={draft.keyPointsText}
                onChange={(e) => updateDraft({ keyPointsText: e.target.value })}
                rows={5}
                className="focus-ring resize-none rounded-lg bg-white/5 px-3 py-2 text-sm text-foreground"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="ai-summary-rabbi" className="text-xs text-muted">
                  רב
                </label>
                <input
                  id="ai-summary-rabbi"
                  value={draft.suggestedRabbi}
                  onChange={(e) => updateDraft({ suggestedRabbi: e.target.value })}
                  placeholder="לא זוהה"
                  className="focus-ring rounded-lg bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted"
                />
                {rabbiName && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs",
                        matchedRabbi ? "bg-accent-health/15 text-accent-health" : "bg-white/5 text-muted"
                      )}
                    >
                      {matchedRabbi ? <Check size={11} aria-hidden /> : <GraduationCap size={11} aria-hidden />}
                      {rabbiName} · {matchedRabbi ? "קיים במאגר" : "חדש"}
                    </span>
                    {!matchedRabbi && (
                      <button
                        onClick={handleCreateRabbi}
                        disabled={creatingRabbi}
                        className="focus-ring flex items-center gap-1 rounded-full bg-accent-faith/15 px-2.5 py-1 text-xs text-accent-faith transition-opacity hover:opacity-80 disabled:opacity-40"
                      >
                        <Plus size={11} aria-hidden />
                        {creatingRabbi ? "יוצר…" : "צור רב חדש"}
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="ai-summary-books" className="text-xs text-muted">
                  ספרים ומקורות (שורה לכל ספר)
                </label>
                <textarea
                  id="ai-summary-books"
                  value={draft.suggestedBooksText}
                  onChange={(e) => updateDraft({ suggestedBooksText: e.target.value })}
                  rows={2}
                  className="focus-ring resize-none rounded-lg bg-white/5 px-3 py-2 text-sm text-foreground"
                />
                {bookNames.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {bookNames.map((name, i) => {
                      const matched = matchedBookFor(name);
                      return (
                        <span key={`${name}-${i}`} className="inline-flex items-center gap-1.5">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs",
                              matched ? "bg-accent-health/15 text-accent-health" : "bg-white/5 text-muted"
                            )}
                          >
                            {matched ? <Check size={11} aria-hidden /> : <BookOpen size={11} aria-hidden />}
                            {name} · {matched ? "קיים במאגר" : "חדש"}
                          </span>
                          {!matched && (
                            <button
                              onClick={() => handleCreateBook(name)}
                              disabled={creatingBookName === name}
                              className="focus-ring flex items-center gap-1 rounded-full bg-accent-faith/15 px-2.5 py-1 text-xs text-accent-faith transition-opacity hover:opacity-80 disabled:opacity-40"
                            >
                              <Plus size={11} aria-hidden />
                              {creatingBookName === name ? "יוצר…" : "צור ספר חדש"}
                            </button>
                          )}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {(linkError || saveError) && <p className="text-xs text-accent-family">{linkError ?? saveError}</p>}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-glass-border p-6 pt-4">
        {step === "review" && !summarizing ? (
          <button
            onClick={() => setStep("input")}
            disabled={saving}
            className="focus-ring flex items-center gap-1 rounded-lg px-2 py-2 text-xs text-muted transition-colors hover:text-foreground disabled:opacity-40"
          >
            <ArrowRight size={13} aria-hidden />
            חזרה לטקסט
          </button>
        ) : (
          <span />
        )}

        {step === "input" ? (
          <button
            onClick={handleSummarize}
            disabled={!canSummarize || summarizing}
            className="focus-ring flex items-center gap-1.5 rounded-lg bg-accent-faith/20 px-4 py-2 text-sm font-medium text-accent-faith transition-opacity hover:opacity-80 disabled:opacity-40"
          >
            {summarizing ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
            {summarizing ? "מעבד…" : "סכם עם AI"}
          </button>
        ) : (
          <button
            onClick={handleSave}
            disabled={!draft?.title.trim() || saving}
            className="focus-ring flex items-center gap-1.5 rounded-lg bg-accent-faith/20 px-4 py-2 text-sm font-medium text-accent-faith transition-opacity hover:opacity-80 disabled:opacity-40"
          >
            {saving ? "שומר…" : `שמירה ל-${APP_NAME}`}
          </button>
        )}
      </div>
    </Modal>
  );
}
