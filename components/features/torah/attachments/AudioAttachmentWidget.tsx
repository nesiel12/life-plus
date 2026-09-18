"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AudioLines,
  Check,
  FileAudio,
  Loader2,
  Mic,
  Pause,
  Pencil,
  Play,
  ScrollText,
  Square,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { PageSection } from "@/components/features/torah/hub/PageSection";
import { InteractiveTranscript } from "@/components/features/torah/lessons/InteractiveTranscript";
import { useAttachments } from "@/components/features/torah/attachments/useAttachments";
import { useRecorder } from "@/components/features/torah/attachments/useRecorder";
import {
  ATTACHMENT_STATUS_LABELS,
  canTranscribe,
  fileSizeLabel,
  recordingTitle,
  type AudioAttachmentView,
  type AudioEntityType,
} from "@/lib/torah/attachments/audio";
import { AUDIO_ACCEPT } from "@/lib/torah/lessons/media";
import { durationLabel, formatTimecode } from "@/lib/torah/lessons/timecode";
import { cn } from "@/lib/utils";

interface AudioAttachmentWidgetProps {
  entityType: AudioEntityType;
  entityId: string;
  /** Shown in the section's subtitle: "הקלטות על משנה ברורה". */
  entityLabel?: string;
  /** Renders without the PageSection chrome, for a drawer or a card. */
  compact?: boolean;
  delay?: number;
  className?: string;
}

/**
 * "שמע ותמלול" — recordings attached to any entity in מרחב תורה.
 *
 * The same component on a book, a rabbi, a lesson, a concept and a note: the
 * entity is a prop, so a recording works identically everywhere and there is
 * one place to fix anything about it.
 *
 * Transcription is ON DEMAND. Attaching audio costs nothing and happens
 * immediately; only "תמלל הקלטה זו" spends AI quota, and the transcript then
 * appears under that recording's own player, seekable line by line.
 */
export function AudioAttachmentWidget({
  entityType,
  entityId,
  entityLabel,
  compact,
  delay,
  className,
}: AudioAttachmentWidgetProps) {
  const reduceMotion = useReducedMotion();
  const { attachments, error, busy, progress, upload, transcribe, rename, remove, setError } = useAttachments(
    entityType,
    entityId
  );
  const recorder = useRecorder();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    await upload({ file, fileName: file.name, source: "upload", durationSeconds: await readDuration(file) });
  }

  async function finishRecording() {
    const result = await recorder.stop();
    if (!result) {
      setError("ההקלטה יצאה ריקה. נסה שוב.");
      return;
    }
    await upload({
      file: result.blob,
      fileName: result.fileName,
      title: recordingTitle(new Date()),
      durationSeconds: result.durationSeconds || undefined,
      source: "recording",
    });
  }

  const body = (
    <div className="flex flex-col gap-4">
      {/* Add: drop a file, browse, or record. */}
      {recorder.recording ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-accent-family/40 bg-accent-family/8 p-4">
          <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-accent-family text-white" aria-hidden>
            <Mic size={18} />
            {!recorder.paused && (
              <span className="absolute inset-0 animate-ping rounded-full bg-accent-family/40" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{recorder.paused ? "ההקלטה מושהית" : "מקליט…"}</p>
            <p className="ltr tabular-nums text-xs text-muted">{formatTimecode(recorder.seconds)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => (recorder.paused ? recorder.resume() : recorder.pause())}
              className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-hairline-card bg-surface px-3 py-1.5 text-xs text-foreground/85"
            >
              {recorder.paused ? <Play size={13} aria-hidden /> : <Pause size={13} aria-hidden />}
              {recorder.paused ? "המשך" : "השהה"}
            </button>
            <button
              type="button"
              onClick={() => void finishRecording()}
              className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-gold px-3 py-1.5 text-xs font-medium text-white"
            >
              <Square size={12} aria-hidden />
              סיים ושמור
            </button>
            <button
              type="button"
              onClick={recorder.cancel}
              className="focus-ring inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted hover:text-foreground"
            >
              <X size={13} aria-hidden />
              בטל
            </button>
          </div>
        </div>
      ) : busy ? (
        <div className="flex items-center gap-3 rounded-2xl border border-hairline-card bg-surface p-4">
          <Loader2 size={16} className="animate-spin text-gold-ink" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-foreground">{busy === "uploading" ? "מעלה את ההקלטה…" : "מסיים…"}</p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-fill">
              <div
                className="h-full rounded-full bg-gold transition-[width] duration-200"
                style={{ width: `${Math.round((busy === "uploading" ? progress : 1) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void chooseFile(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed p-4 transition-colors",
            dragging ? "border-gold-line bg-gold-soft/60" : "border-hairline-card bg-surface-sunken/40"
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gold-soft text-gold-ink" aria-hidden>
              <AudioLines size={17} />
            </span>
            <p className="min-w-0 text-xs leading-relaxed text-muted">
              גרור לכאן קובץ שמע, או הקלט הערה קולית.
              <br />
              MP3 · M4A · WAV · OGG — עד 50MB
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-hairline-card bg-surface px-3 py-1.5 text-xs font-medium text-foreground/85 hover:border-gold-line"
            >
              <UploadCloud size={13} aria-hidden />
              העלה קובץ
            </button>
            <button
              type="button"
              onClick={() => void recorder.start()}
              className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-gold px-3 py-1.5 text-xs font-medium text-white"
            >
              <Mic size={13} aria-hidden />
              הקלט
            </button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept={AUDIO_ACCEPT}
            className="hidden"
            onChange={(e) => {
              void chooseFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {(error || recorder.error) && (
        <p className="text-xs text-accent-family" role="alert">
          {error ?? recorder.error}
        </p>
      )}

      {/* The recordings themselves. */}
      {attachments === null ? (
        <p className="flex items-center gap-2 text-xs text-muted" role="status">
          <Loader2 size={13} className="animate-spin" aria-hidden />
          טוען הקלטות…
        </p>
      ) : attachments.length === 0 ? (
        <p className="text-xs text-muted">עוד אין הקלטות כאן. כל הקלטה שתוסיף תישמר על הפריט הזה ותהיה זמינה להאזנה בכל זמן.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {attachments.map((attachment) => (
              <motion.li
                key={attachment.id}
                layout={!reduceMotion}
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
              >
                <AttachmentCard
                  attachment={attachment}
                  onTranscribe={() => void transcribe(attachment.id)}
                  onRename={(title) => void rename(attachment.id, title)}
                  onDelete={() => void remove(attachment.id)}
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );

  if (compact) return <div className={className}>{body}</div>;

  return (
    <PageSection
      id="recordings"
      icon={AudioLines}
      tone="learning"
      title="הקלטות ותמלול"
      subtitle={entityLabel ? `שמע ששייך ל${entityLabel} — האזנה, ותמלול לפי בקשה` : "האזנה, ותמלול לפי בקשה"}
      delay={delay}
      className={className}
    >
      {body}
    </PageSection>
  );
}

function AttachmentCard({
  attachment,
  onTranscribe,
  onRename,
  onDelete,
}: {
  attachment: AudioAttachmentView;
  onTranscribe: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(attachment.title);

  const transcribing = attachment.status === "transcribing";
  const hasTranscript = attachment.transcriptLines.length > 0;

  // Opens itself the first time a transcript arrives — the learner pressed
  // "תמלל" and then went to read something else; the result should be visible
  // when they come back, not behind another click.
  useEffect(() => {
    if (hasTranscript && attachment.status === "ready") setShowTranscript(true);
  }, [hasTranscript, attachment.status]);

  function seek(seconds: number) {
    const element = audio.current;
    if (!element) return;
    element.currentTime = seconds;
    void element.play().catch(() => undefined);
  }

  return (
    <div className="rounded-2xl border border-hairline-card bg-surface p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-learning/12 text-accent-learning" aria-hidden>
            {attachment.source === "recording" ? <Mic size={15} /> : <FileAudio size={15} />}
          </span>
          <div className="min-w-0">
            {editing ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const title = draftTitle.trim();
                  if (title) onRename(title);
                  setEditing(false);
                }}
                className="flex items-center gap-1"
              >
                <input
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  autoFocus
                  maxLength={200}
                  aria-label="שם ההקלטה"
                  className="min-w-0 rounded-lg border border-gold-line bg-surface px-2 py-0.5 text-sm text-foreground outline-none"
                />
                <button type="submit" aria-label="שמור שם" className="focus-ring rounded p-1 text-gold-ink">
                  <Check size={14} aria-hidden />
                </button>
              </form>
            ) : (
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <span className="truncate">{attachment.title}</span>
                <button
                  type="button"
                  onClick={() => {
                    setDraftTitle(attachment.title);
                    setEditing(true);
                  }}
                  aria-label="שנה שם"
                  className="focus-ring rounded p-0.5 text-muted hover:text-foreground"
                >
                  <Pencil size={11} aria-hidden />
                </button>
              </p>
            )}
            <p className="flex flex-wrap items-center gap-x-2 text-[0.7rem] text-muted">
              {durationLabel(attachment.durationSeconds) && <span>{durationLabel(attachment.durationSeconds)}</span>}
              {fileSizeLabel(attachment.sizeBytes) && <span className="ltr">{fileSizeLabel(attachment.sizeBytes)}</span>}
              {attachment.status !== "stored" && attachment.status !== "ready" && (
                <span>{ATTACHMENT_STATUS_LABELS[attachment.status]}</span>
              )}
              {attachment.status === "ready" && <span className="text-accent-health">תומלל</span>}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {canTranscribe(attachment.status) && (
            <button
              type="button"
              onClick={onTranscribe}
              className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-gold px-3 py-1.5 text-xs font-medium text-white"
            >
              <ScrollText size={13} aria-hidden />
              {attachment.status === "failed" ? "נסה לתמלל שוב" : "תמלל הקלטה זו"}
            </button>
          )}
          {hasTranscript && (
            <button
              type="button"
              onClick={() => setShowTranscript((open) => !open)}
              aria-expanded={showTranscript}
              className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-hairline-card px-3 py-1.5 text-xs text-foreground/85 hover:border-gold-line"
            >
              <ScrollText size={13} aria-hidden />
              {showTranscript ? "הסתר תמלול" : "הצג תמלול"}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`למחוק את "${attachment.title}"?`)) onDelete();
            }}
            aria-label="מחק הקלטה"
            className="focus-ring rounded-lg p-1.5 text-muted transition-colors hover:text-accent-family"
          >
            <Trash2 size={14} aria-hidden />
          </button>
        </div>
      </div>

      {attachment.mediaUrl && (
        <audio
          ref={audio}
          src={attachment.mediaUrl}
          controls
          preload="none"
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          className="mt-2.5 w-full"
          aria-label={`נגן: ${attachment.title}`}
        />
      )}

      {transcribing && (
        <div className="mt-2.5 flex flex-col gap-1.5" role="status">
          <p className="flex items-center gap-2 text-xs text-muted">
            <Loader2 size={12} className="animate-spin" aria-hidden />
            {attachment.progress.pauseReason
              ? attachment.progress.pauseReason
              : attachment.progress.windowsTotal > 0
                ? `מתמלל… ${attachment.progress.windowsDone}/${attachment.progress.windowsTotal} קטעים`
                : "מתמלל… מכין את ההקלטה"}
          </p>
          <div className="h-1 overflow-hidden rounded-full bg-fill">
            <div
              className="h-full rounded-full bg-gold transition-[width] duration-500"
              style={{ width: `${Math.round(attachment.progress.fraction * 100)}%` }}
            />
          </div>
        </div>
      )}

      {attachment.status === "failed" && attachment.error && (
        <p className="mt-2 text-xs text-accent-family">{attachment.error}</p>
      )}

      {showTranscript && hasTranscript && (
        <div className="mt-3 border-t border-hairline-card pt-3">
          <InteractiveTranscript lines={attachment.transcriptLines} chapters={[]} currentTime={currentTime} onSeek={seek} />
        </div>
      )}
    </div>
  );
}

/** Reads a local file's duration from its own metadata, without uploading it. */
function readDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (value: number | undefined) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : undefined);
    audio.onerror = () => done(undefined);
    setTimeout(() => done(undefined), 8000);
    audio.src = url;
  });
}
