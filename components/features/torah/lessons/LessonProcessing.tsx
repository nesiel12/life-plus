"use client";

import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, AudioLines, Check, Clock3, FileSearch, Loader2, RotateCcw, Sparkles, UploadCloud } from "lucide-react";
import type { LessonDetail } from "@/lib/torah/lessons/types";
import { formatTimecode } from "@/lib/torah/lessons/timecode";
import { cn } from "@/lib/utils";

interface LessonProcessingProps {
  lesson: LessonDetail;
  onRetry: () => void;
  retrying: boolean;
}

const STEPS = [
  { key: "upload", label: "התקבל", icon: UploadCloud },
  { key: "transcribe", label: "תמלול", icon: AudioLines },
  { key: "analyze", label: "ניתוח ומקורות", icon: FileSearch },
  { key: "ready", label: "מוכן ללימוד", icon: Sparkles },
] as const;

function stepIndex(lesson: LessonDetail): number {
  if (lesson.status === "ready") return 3;
  if (lesson.status === "analyzing") return 2;
  if (lesson.status === "transcribing") return 1;
  if (lesson.status === "pending") return 1;
  return 0;
}

/**
 * What a lesson looks like while the background pipeline works on it: where it
 * is, how far along, and — as windows finish — the transcript itself, growing.
 * Failure and quota pauses say exactly what happened and what happens next.
 */
export function LessonProcessing({ lesson, onRetry, retrying }: LessonProcessingProps) {
  const reduceMotion = useReducedMotion();
  const current = stepIndex(lesson);
  const { progress } = lesson;
  const failed = lesson.status === "failed";
  const recent = lesson.transcript.slice(-6);

  return (
    <section className="glass-card rounded-2xl p-5 sm:p-6" aria-live="polite">
      <ol className="mb-5 grid grid-cols-4 gap-2">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          const done = index < current || lesson.status === "ready";
          const active = index === current && !failed;
          return (
            <li key={step.key} className="flex flex-col items-center gap-1.5 text-center">
              <span
                className={cn(
                  "grid size-10 place-items-center rounded-full border transition-colors",
                  done && "border-gold bg-gold text-white",
                  active && "border-gold bg-gold-soft text-gold-ink",
                  !done && !active && "border-hairline-card text-muted",
                  failed && index === current && "border-accent-family/40 bg-accent-family/10 text-accent-family"
                )}
              >
                {done ? (
                  <Check size={16} aria-hidden />
                ) : active ? (
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                ) : (
                  <Icon size={16} aria-hidden />
                )}
              </span>
              <span className={cn("text-[0.7rem]", active || done ? "text-foreground" : "text-muted")}>{step.label}</span>
            </li>
          );
        })}
      </ol>

      <div className="h-2 overflow-hidden rounded-full bg-fill">
        <motion.div
          className={cn("h-full rounded-full", failed ? "bg-accent-family/60" : "bg-gradient-to-l from-gold to-gold-ink")}
          initial={false}
          animate={{ width: `${Math.round(progress.fraction * 100)}%` }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.6, ease: "easeOut" }}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>
          {lesson.status === "uploading" && "ממתין להשלמת ההעלאה…"}
          {lesson.status === "pending" && "בתור לעיבוד…"}
          {lesson.status === "transcribing" &&
            (progress.windowsTotal > 0
              ? `מתמלל קטע ${Math.min(progress.windowsDone + 1, progress.windowsTotal)} מתוך ${progress.windowsTotal}`
              : "מתמלל…")}
          {lesson.status === "analyzing" &&
            (progress.phase === "write" ? "מאתר מקורות בספריא ובונה פרקים…" : "מנתח את השיעור וכותב סיכום…")}
          {failed && "העיבוד נעצר"}
        </span>
        <span className="ltr tabular-nums">{Math.round(progress.fraction * 100)}%</span>
      </div>

      {progress.pausedUntil && (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-gold-soft/60 p-3 text-sm text-foreground/85">
          <Clock3 size={15} className="mt-0.5 shrink-0 text-gold-ink" aria-hidden />
          {progress.pauseReason}
        </p>
      )}

      {failed && (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-accent-family/25 bg-accent-family/5 p-4">
          <p className="flex items-start gap-2 text-sm text-foreground/85">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-accent-family" aria-hidden />
            {lesson.error ?? "העיבוד נכשל."}
          </p>
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="focus-ring flex w-fit items-center gap-1.5 rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background disabled:opacity-50"
          >
            {retrying ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <RotateCcw size={13} aria-hidden />}
            נסה שוב מהנקודה שבה נעצר
          </button>
        </div>
      )}

      {!failed && lesson.status !== "ready" && (
        <p className="mt-4 text-xs leading-relaxed text-muted">
          העיבוד רץ ברקע ומתקדם ברציפות כל עוד הדף פתוח. אם תסגור אותו — הוא ימשיך בהרצה הבאה של משימות הרקע.
        </p>
      )}

      {recent.length > 0 && lesson.status !== "ready" && (
        <div className="mt-5 border-t border-hairline-card pt-4">
          <p className="mb-2 text-xs font-medium text-muted">התמלול עד כה</p>
          <ul className="flex flex-col gap-1.5">
            {recent.map((line) => (
              <motion.li
                key={`${line.start}-${line.text.slice(0, 12)}`}
                initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-3 text-sm leading-relaxed text-foreground/80"
              >
                <span className="ltr mt-0.5 shrink-0 text-[0.7rem] tabular-nums text-muted">{formatTimecode(line.start)}</span>
                {line.text}
              </motion.li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
