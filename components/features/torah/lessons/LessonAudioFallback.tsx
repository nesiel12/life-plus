"use client";

import { useRef, useState } from "react";
import { AudioLines, Loader2, UploadCloud, X } from "lucide-react";
import { AUDIO_ACCEPT, MAX_AUDIO_BYTES, audioMimeType } from "@/lib/torah/lessons/media";
import { readAudioDuration, uploadWithProgress } from "@/lib/torah/lessons/clientUpload";
import type { LessonDetail } from "@/lib/torah/lessons/types";

interface LessonAudioFallbackProps {
  lesson: LessonDetail;
  onUploaded: () => void;
}

/**
 * The manual last resort for a youtube lesson Gemini could not transcribe —
 * neither directly nor through the pipeline's own audio-extraction fallback
 * (lib/torah/lessons/pipeline.ts). Rather than leaving the user stuck on a
 * permanently failed lesson, this lets them supply the audio themselves:
 * POST .../audio-fallback converts the lesson into an ordinary audio upload,
 * and from there it takes the same signed-upload-URL → confirm → pipeline
 * path as any audio lesson (see LessonUploader.tsx).
 */
export function LessonAudioFallback({ lesson, onUploaded }: LessonAudioFallbackProps) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<null | "uploading" | "confirming">(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

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
  }

  async function submit() {
    if (!file) return;
    setError(null);
    try {
      const duration = await readAudioDuration(file);
      const created = await fetch(`/api/torah/lessons/${lesson.id}/audio-fallback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type, sizeBytes: file.size, durationSeconds: duration }),
      });
      const data = await created.json();
      if (!created.ok) throw new Error(typeof data.error === "string" ? data.error : "יצירת ההעלאה נכשלה.");

      setBusy("uploading");
      setProgress(0);
      await uploadWithProgress(data.upload.url, file, data.upload.mimeType, setProgress);

      setBusy("confirming");
      const confirmed = await fetch(`/api/torah/lessons/${lesson.id}/uploaded`, { method: "POST" });
      if (!confirmed.ok) {
        const body = await confirmed.json().catch(() => ({}));
        throw new Error(typeof body.error === "string" ? body.error : "אישור ההעלאה נכשל.");
      }
      onUploaded();
    } catch (err) {
      setError(err instanceof Error && /[א-ת]/.test(err.message) ? err.message : "ההעלאה נכשלה. בדוק את החיבור ונסה שוב.");
      setBusy(null);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2.5 border-t border-accent-family/20 pt-3">
      <p className="text-xs text-foreground/80">
        אפשר גם להעלות בעצמך הקלטה של השיעור (MP3, M4A, WAV, OGG או FLAC, עד 50MB) והתמלול ימשיך ממנה.
      </p>
      <input
        ref={input}
        type="file"
        accept={AUDIO_ACCEPT}
        className="hidden"
        onChange={(e) => void chooseFile(e.target.files?.[0])}
      />
      {file ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-hairline-card bg-surface p-2.5">
          <AudioLines size={16} className="shrink-0 text-accent-learning" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground">{file.name}</p>
            <p className="text-[0.65rem] text-muted">
              <span className="ltr tabular-nums">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
            </p>
          </div>
          {!busy && (
            <button type="button" onClick={() => setFile(null)} aria-label="הסר קובץ" className="focus-ring rounded-lg p-1 text-muted hover:text-foreground">
              <X size={14} aria-hidden />
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="focus-ring flex w-fit items-center gap-1.5 rounded-full border border-hairline-card px-3.5 py-1.5 text-xs text-foreground/85 hover:border-gold-line"
        >
          <UploadCloud size={13} aria-hidden />
          בחר קובץ שמע
        </button>
      )}

      {busy === "uploading" && (
        <div role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="התקדמות ההעלאה">
          <div className="h-1.5 overflow-hidden rounded-full bg-fill">
            <div className="h-full rounded-full bg-gradient-to-l from-gold to-gold-ink transition-[width]" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      )}

      {error && <p className="text-xs text-accent-family">{error}</p>}

      {file && (
        <button
          type="button"
          onClick={() => void submit()}
          disabled={Boolean(busy)}
          className="focus-ring flex w-fit items-center gap-1.5 rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <UploadCloud size={13} aria-hidden />}
          {busy === "uploading" ? "מעלה…" : busy === "confirming" ? "מתחיל עיבוד…" : "העלה קובץ שמע"}
        </button>
      )}
    </div>
  );
}
