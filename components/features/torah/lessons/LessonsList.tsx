"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock3, Headphones, Loader2, MonitorPlay } from "lucide-react";
import { youtubeThumbnailUrl, youtubeVideoId } from "@/lib/learning/youtube";
import { durationLabel } from "@/lib/torah/lessons/timecode";
import type { LessonSummary } from "@/lib/torah/lessons/types";
import { cn } from "@/lib/utils";

const ACTIVE = new Set(["uploading", "pending", "transcribing", "analyzing"]);

const STATUS: Record<LessonSummary["status"], string> = {
  uploading: "ממתין להעלאה",
  pending: "בתור לעיבוד",
  transcribing: "מתמלל",
  analyzing: "מנתח",
  ready: "מוכן",
  failed: "נכשל",
};

/** "השיעורים שלי" — every uploaded lesson with its live processing state. */
export function LessonsList() {
  const [lessons, setLessons] = useState<LessonSummary[] | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/torah/lessons", { cache: "no-store" });
      const data = await response.json();
      if (response.ok) setLessons(data.lessons);
    } catch {
      setLessons((current) => current ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const anyActive = lessons?.some((l) => ACTIVE.has(l.status)) ?? false;
  useEffect(() => {
    if (!anyActive) return;
    const timer = setInterval(() => void load(), 8000);
    return () => clearInterval(timer);
  }, [anyActive, load]);

  if (lessons === null) {
    return <div className="h-24 animate-pulse rounded-2xl bg-fill" aria-hidden />;
  }
  if (lessons.length === 0) return null;

  return (
    <section aria-labelledby="my-lessons-title" className="flex flex-col gap-3">
      <h2 id="my-lessons-title" className="text-base font-semibold text-foreground">
        השיעורים שלי
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {lessons.map((lesson) => {
          const videoId = lesson.kind === "youtube" && lesson.sourceUrl ? youtubeVideoId(lesson.sourceUrl) : null;
          const active = ACTIVE.has(lesson.status);
          return (
            <li key={lesson.id}>
              <Link
                href={`/areas/torah/lessons/${lesson.id}`}
                className="focus-ring group flex h-full gap-3 rounded-2xl border border-hairline-card bg-surface p-3 transition-colors hover:border-gold-line"
              >
                {videoId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={youtubeThumbnailUrl(videoId)} alt="" className="aspect-video w-24 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="grid aspect-video w-24 shrink-0 place-items-center rounded-lg bg-accent-learning/10 text-accent-learning">
                    {lesson.kind === "youtube" ? <MonitorPlay size={20} aria-hidden /> : <Headphones size={20} aria-hidden />}
                  </span>
                )}
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="line-clamp-2 text-sm font-medium leading-snug text-foreground">{lesson.title}</span>
                  <span className="flex flex-wrap items-center gap-1.5 text-[0.68rem] text-muted">
                    <span
                      className={cn(
                        "flex items-center gap-1 rounded-full px-1.5 py-0.5",
                        lesson.status === "ready" && "bg-accent-health/12 text-accent-health",
                        lesson.status === "failed" && "bg-accent-family/10 text-accent-family",
                        active && "bg-gold-soft text-gold-ink"
                      )}
                    >
                      {lesson.status === "ready" && <CheckCircle2 size={10} aria-hidden />}
                      {lesson.status === "failed" && <AlertTriangle size={10} aria-hidden />}
                      {active && <Loader2 size={10} className="animate-spin" aria-hidden />}
                      {STATUS[lesson.status]}
                      {lesson.status === "transcribing" && lesson.progress.windowsTotal > 0 && (
                        <span className="ltr tabular-nums"> {Math.round(lesson.progress.fraction * 100)}%</span>
                      )}
                    </span>
                    {durationLabel(lesson.durationSeconds) && (
                      <span className="flex items-center gap-0.5">
                        <Clock3 size={10} aria-hidden />
                        {durationLabel(lesson.durationSeconds)}
                      </span>
                    )}
                    {lesson.speaker && <span className="truncate">{lesson.speaker}</span>}
                  </span>
                  {active && (
                    <span className="mt-auto h-1 overflow-hidden rounded-full bg-fill">
                      <span className="block h-full rounded-full bg-gold transition-[width]" style={{ width: `${lesson.progress.fraction * 100}%` }} />
                    </span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
