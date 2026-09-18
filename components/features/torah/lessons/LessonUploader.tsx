"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AudioLines, FileAudio, Link2, Loader2, MonitorPlay, UploadCloud, X } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { AUDIO_ACCEPT, MAX_AUDIO_BYTES, audioMimeType } from "@/lib/torah/lessons/media";
import { youtubeThumbnailUrl, youtubeVideoId } from "@/lib/learning/youtube";
import { durationLabel } from "@/lib/torah/lessons/timecode";
import { cn } from "@/lib/utils";

type Mode = "audio" | "youtube";

/** Reads a local audio file's duration from its own metadata, without uploading it. */
function readAudioDuration(file: File): Promise<number | undefined> {
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

/** PUTs the file to the signed upload URL with real progress events. */
function uploadWithProgress(url: string, file: File, mimeType: string, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("x-upsert", "true");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("upload network error"));
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", new File([file], file.name, { type: mimeType }));
    xhr.send(form);
  });
}

/**
 * "העלאת שיעור": an audio recording or a YouTube link, optionally tied to a
 * book or rabbi in the library.
 *
 * Audio goes straight from the browser to storage through a signed URL (with a
 * real progress bar) — never through a serverless function — and processing
 * then runs as a background job. The user lands on the lesson page, where the
 * transcript appears as it is produced.
 */
export function LessonUploader() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const books = useAtlasStore((s) => s.books);
  const rabbis = useAtlasStore((s) => s.rabbis);

  const [mode, setMode] = useState<Mode>("audio");
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | undefined>();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [anchor, setAnchor] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<null | "creating" | "uploading" | "confirming">(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const videoId = mode === "youtube" ? youtubeVideoId(url) : null;

  async function chooseFile(candidate: File | undefined) {
    setError(null);
    if (!candidate) return;
    if (!audioMimeType(candidate.type, candidate.name)) {
      setError("זה לא קובץ שמע נתמך. אפשר להעלות MP3, M4A, WAV, OGG או FLAC.");
      return;
    }
    if (candidate.size > MAX_AUDIO_BYTES) {
      setError("הקובץ גדול מ-50MB. אפשר לדחוס אותו ל-MP3 באיכות 64kbps ולנסות שוב.");
      return;
    }
    setFile(candidate);
    if (!title) setTitle(candidate.name.replace(/\.[^.]+$/, ""));
    setDuration(await readAudioDuration(candidate));
  }

  function anchorFields() {
    if (!anchor) return {};
    const [kind, id] = anchor.split(":");
    return kind === "book" ? { bookId: id } : { rabbiId: id };
  }

  async function submit() {
    setError(null);
    try {
      if (mode === "youtube") {
        if (!videoId) {
          setError("הדבק קישור YouTube תקין.");
          return;
        }
        setBusy("creating");
        const response = await fetch("/api/torah/lessons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "youtube", url, title: title.trim() || undefined, ...anchorFields() }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "יצירת השיעור נכשלה.");
        router.push(`/areas/torah/lessons/${data.lesson.id}`);
        return;
      }

      if (!file) {
        setError("בחר קובץ שמע.");
        return;
      }
      setBusy("creating");
      const created = await fetch("/api/torah/lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "audio",
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          durationSeconds: duration,
          title: title.trim() || undefined,
          ...anchorFields(),
        }),
      });
      const data = await created.json();
      if (!created.ok) throw new Error(typeof data.error === "string" ? data.error : "יצירת השיעור נכשלה.");

      setBusy("uploading");
      setProgress(0);
      await uploadWithProgress(data.upload.url, file, data.upload.mimeType, setProgress);

      setBusy("confirming");
      const confirmed = await fetch(`/api/torah/lessons/${data.lesson.id}/uploaded`, { method: "POST" });
      if (!confirmed.ok) {
        const body = await confirmed.json().catch(() => ({}));
        throw new Error(typeof body.error === "string" ? body.error : "אישור ההעלאה נכשל.");
      }
      router.push(`/areas/torah/lessons/${data.lesson.id}`);
    } catch (err) {
      setError(err instanceof Error && /[א-ת]/.test(err.message) ? err.message : "ההעלאה נכשלה. בדוק את החיבור ונסה שוב.");
      setBusy(null);
    }
  }

  const canSubmit = !busy && (mode === "audio" ? Boolean(file) : Boolean(videoId));

  return (
    <section className="glass-card rounded-3xl p-5 sm:p-6" aria-labelledby="lesson-uploader-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="lesson-uploader-title" className="text-base font-semibold text-foreground">
            העלאת שיעור
          </h2>
          <p className="text-xs text-muted">תמלול מלא, פרקים, מקורות ותרגול — נבנים ברקע</p>
        </div>
        <div role="tablist" aria-label="סוג השיעור" className="flex rounded-full bg-fill-subtle p-1">
          {(
            [
              { key: "audio", label: "קובץ שמע", icon: FileAudio },
              { key: "youtube", label: "קישור YouTube", icon: MonitorPlay },
            ] as const
          ).map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.key}
                type="button"
                role="tab"
                aria-selected={mode === option.key}
                onClick={() => {
                  setMode(option.key);
                  setError(null);
                }}
                className={cn(
                  "focus-ring flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors",
                  mode === option.key ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
                )}
              >
                <Icon size={13} aria-hidden />
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {mode === "audio" ? (
        <>
          <input
            ref={input}
            type="file"
            accept={AUDIO_ACCEPT}
            className="hidden"
            data-testid="lesson-audio-input"
            onChange={(e) => void chooseFile(e.target.files?.[0])}
          />
          {file ? (
            <div className="flex items-center gap-3 rounded-2xl border border-hairline-card bg-surface p-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-learning/12 text-accent-learning">
                <AudioLines size={20} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                <p className="text-xs text-muted">
                  <span className="ltr tabular-nums">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                  {durationLabel(duration) && ` · ${durationLabel(duration)}`}
                </p>
              </div>
              {!busy && (
                <button type="button" onClick={() => setFile(null)} aria-label="הסר קובץ" className="focus-ring rounded-lg p-1.5 text-muted hover:text-foreground">
                  <X size={15} aria-hidden />
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => input.current?.click()}
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
                "focus-ring flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed py-9 transition-colors",
                dragging ? "border-gold bg-gold-soft/50 text-gold-ink" : "border-hairline-card text-muted hover:border-gold-line hover:text-foreground"
              )}
            >
              <UploadCloud size={26} aria-hidden />
              <span className="text-sm font-medium">גרור לכאן הקלטה של שיעור, או לחץ לבחירה</span>
              <span className="text-[0.7rem]">MP3 · M4A · WAV · OGG · FLAC — עד 50MB</span>
            </button>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 rounded-2xl border border-hairline-card bg-surface px-3 py-2.5 focus-within:border-gold-line">
            <Link2 size={15} className="shrink-0 text-muted" aria-hidden />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
              aria-label="קישור לסרטון YouTube"
              dir="ltr"
              className="ltr min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
            />
          </label>
          <AnimatePresence>
            {videoId && (
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={youtubeThumbnailUrl(videoId)} alt="" className="aspect-video w-48 rounded-xl object-cover ring-1 ring-hairline-card" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={mode === "youtube" ? "כותרת (לא חובה — תילקח מהסרטון)" : "כותרת השיעור"}
          aria-label="כותרת השיעור"
          className="focus-ring rounded-xl border border-hairline-card bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted"
        />
        <select
          value={anchor}
          onChange={(e) => setAnchor(e.target.value)}
          aria-label="שיוך לספר או לרב"
          className="focus-ring rounded-xl border border-hairline-card bg-surface px-3 py-2 text-sm text-foreground"
        >
          <option value="">בלי שיוך לספר או לרב</option>
          {books.length > 0 && (
            <optgroup label="ספרים">
              {books.map((b) => (
                <option key={b.id} value={`book:${b.id}`}>
                  {b.hebrewTitle ?? b.title}
                </option>
              ))}
            </optgroup>
          )}
          {rabbis.length > 0 && (
            <optgroup label="רבנים">
              {rabbis.map((r) => (
                <option key={r.id} value={`rabbi:${r.id}`}>
                  {r.hebrewName ?? r.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      {busy === "uploading" && (
        <div className="mt-4" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="התקדמות ההעלאה">
          <div className="h-2 overflow-hidden rounded-full bg-fill">
            <div className="h-full rounded-full bg-gradient-to-l from-gold to-gold-ink transition-[width]" style={{ width: `${progress * 100}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">
            מעלה… <span className="ltr tabular-nums">{Math.round(progress * 100)}%</span>
          </p>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-accent-family">{error}</p>}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => void submit()}
          className="focus-ring flex items-center gap-2 rounded-full bg-gold px-5 py-2 text-sm font-medium text-white shadow-sm transition-opacity disabled:opacity-40"
        >
          {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <UploadCloud size={15} aria-hidden />}
          {busy === "creating" ? "יוצר שיעור…" : busy === "uploading" ? "מעלה…" : busy === "confirming" ? "מתחיל עיבוד…" : "העלה ועבד"}
        </button>
      </div>
    </section>
  );
}
