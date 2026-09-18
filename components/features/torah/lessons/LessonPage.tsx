"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  BookmarkPlus,
  Check,
  CirclePause,
  Clock3,
  GraduationCap,
  Headphones,
  Library,
  ListOrdered,
  Loader2,
  MonitorPlay,
  NotebookPen,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { ActionPill, PageSection, SectionPlaceholder } from "@/components/features/torah/hub/PageSection";
import { LessonPlayer, type LessonPlayerHandle } from "@/components/features/torah/lessons/LessonPlayer";
import { LessonProcessing } from "@/components/features/torah/lessons/LessonProcessing";
import { InteractiveTranscript } from "@/components/features/torah/lessons/InteractiveTranscript";
import { SourcesPanel } from "@/components/features/torah/lessons/SourcesPanel";
import { useLesson } from "@/components/features/torah/lessons/useLesson";
import { durationLabel, formatTimecode } from "@/lib/torah/lessons/timecode";
import type { LearningChunkView, LessonDetail } from "@/lib/torah/lessons/types";
import { cn } from "@/lib/utils";
import { HavrutaSection } from "@/components/features/torah/havruta/HavrutaSection";
import { AudioAttachmentWidget } from "@/components/features/torah/attachments/AudioAttachmentWidget";
import { ScanNoteButton } from "@/components/features/torah/scan/HandwritingScanner";

type Tab = "transcript" | "summary" | "chapters";

/**
 * A lesson (שיעור): the media, the transcript that follows it, the smart
 * chapters, the Sources Panel, and the way into practice.
 *
 * Learning is paced in parts. When playback reaches the end of a part the
 * page pauses and offers practice — the "pause for practice" rhythm — and
 * stays out of the way if the user would rather keep listening.
 */
export function LessonPage({ lessonId }: { lessonId: string }) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const { lesson, setLesson, error, loading, reload } = useLesson(lessonId);
  const books = useAtlasStore((s) => s.books);
  const rabbis = useAtlasStore((s) => s.rabbis);

  const player = useRef<LessonPlayerHandle>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState<Tab>("transcript");
  const [retrying, setRetrying] = useState(false);
  const [breakChunk, setBreakChunk] = useState<LearningChunkView | null>(null);
  const dismissedBreaks = useRef(new Set<string>());
  const previousTime = useRef(0);

  const seek = useCallback((seconds: number) => {
    player.current?.seek(seconds, true);
    setCurrentTime(seconds);
    previousTime.current = seconds;
  }, []);

  // The practice pause: crossing the end of an unfinished part while playing.
  const onTime = useCallback(
    (seconds: number) => {
      setCurrentTime(seconds);
      const before = previousTime.current;
      previousTime.current = seconds;
      if (!lesson || seconds - before > 5 || seconds < before) return; // a seek, not playback
      const crossed = lesson.chunks.find(
        (chunk) =>
          chunk.endSeconds !== null &&
          before < chunk.endSeconds &&
          seconds >= chunk.endSeconds &&
          !chunk.completedAt &&
          !dismissedBreaks.current.has(chunk.id)
      );
      if (crossed) {
        player.current?.pause();
        setBreakChunk(crossed);
      }
    },
    [lesson]
  );

  async function retry() {
    setRetrying(true);
    try {
      await fetch(`/api/torah/lessons/${lessonId}/retry`, { method: "POST" });
      await reload();
    } finally {
      setRetrying(false);
    }
  }

  if (loading && !lesson) {
    return (
      <main className="min-h-screen px-4 py-10 sm:px-10 sm:py-14 lg:px-16">
        <p className="flex items-center gap-2 text-sm text-muted" role="status">
          <Loader2 size={15} className="animate-spin" aria-hidden />
          טוען את השיעור…
        </p>
      </main>
    );
  }

  if (!lesson) {
    return (
      <main className="min-h-screen px-4 py-10 sm:px-10 lg:px-16">
        <BackLink />
        <SectionPlaceholder icon={Headphones} title="השיעור לא נמצא" body={error ?? undefined}>
          <Link href="/areas/torah?tab=shiurim" className="focus-ring rounded-full bg-gold px-3 py-1.5 text-xs text-white">
            לכל השיעורים
          </Link>
        </SectionPlaceholder>
      </main>
    );
  }

  const book = lesson.bookId ? books.find((b) => b.id === lesson.bookId) : undefined;
  const rabbi = lesson.rabbiId ? rabbis.find((r) => r.id === lesson.rabbiId) : undefined;
  const ready = lesson.status === "ready";
  const hasMedia = lesson.kind === "youtube" || Boolean(lesson.mediaUrl);
  const completedParts = lesson.chunks.filter((c) => c.completedAt).length;

  return (
    <main className="min-h-screen px-4 py-10 sm:px-10 sm:py-14 lg:px-16">
      <div className="mb-5">
        <BackLink />
      </div>

      {/* ── Header ───────────────────────────────────────────────────── */}
      <motion.header
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border border-hairline-card bg-surface p-5 shadow-[0_24px_60px_-40px_rgba(16,16,20,0.45)] sm:p-7"
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,var(--gold-soft),transparent_55%)]" />
        <div className="relative flex flex-col gap-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-gold-ink">
            {lesson.kind === "youtube" ? <MonitorPlay size={13} aria-hidden /> : <Headphones size={13} aria-hidden />}
            {lesson.kind === "youtube" ? "שיעור וידאו" : "שיעור שמע"}
            {lesson.speaker && <span className="text-muted">· {lesson.speaker}</span>}
          </p>
          <h1 className="text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">{lesson.title}</h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            {durationLabel(lesson.durationSeconds) && (
              <span className="flex items-center gap-1 rounded-full border border-hairline-card px-2.5 py-1">
                <Clock3 size={12} className="text-gold-ink" aria-hidden />
                {durationLabel(lesson.durationSeconds)}
              </span>
            )}
            {book && (
              <Link href={`/areas/torah/books/${book.id}`} className="focus-ring flex items-center gap-1 rounded-full border border-hairline-card px-2.5 py-1 hover:border-gold-line">
                <BookOpen size={12} className="text-gold-ink" aria-hidden />
                {book.hebrewTitle ?? book.title}
              </Link>
            )}
            {rabbi && (
              <Link href={`/areas/torah/rabbis/${rabbi.id}`} className="focus-ring flex items-center gap-1 rounded-full border border-hairline-card px-2.5 py-1 hover:border-gold-line">
                <GraduationCap size={12} className="text-gold-ink" aria-hidden />
                {rabbi.hebrewName ?? rabbi.name}
              </Link>
            )}
            {ready && lesson.sources.length > 0 && (
              <span className="flex items-center gap-1 rounded-full border border-hairline-card px-2.5 py-1">
                <Library size={12} className="text-gold-ink" aria-hidden />
                {lesson.sources.length} מקורות
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-2">
            {ready && lesson.chunks.length > 0 && (
              <ActionPill icon={Target} variant="gold" onClick={() => router.push(`/areas/torah/lessons/${lesson.id}/practice`)}>
                {completedParts > 0 ? `להמשיך לתרגל (${completedParts}/${lesson.chunks.length})` : "לתרגל את השיעור"}
              </ActionPill>
            )}
            {ready && <LogToJournal lesson={lesson} onLogged={(id) => setLesson({ ...lesson, knowledgeEntryId: id })} />}
            <ScanNoteButton target={{ type: "lesson", id: lesson.id, label: lesson.title }} label="סרוק הערות מהשיעור" />
            <DeleteLesson lessonId={lesson.id} />
          </div>
        </div>
      </motion.header>

      {!ready && (
        <div className="mt-5">
          <LessonProcessing lesson={lesson} onRetry={() => void retry()} retrying={retrying} />
        </div>
      )}

      {(ready || lesson.transcript.length > 0) && (
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="flex min-w-0 flex-col gap-4">
            {hasMedia && (
              <div className="xl:sticky xl:top-4 xl:z-10">
                <LessonPlayer
                  ref={player}
                  kind={lesson.kind}
                  mediaUrl={lesson.mediaUrl}
                  title={lesson.title}
                  onTime={onTime}
                  onPlayingChange={setPlaying}
                />
              </div>
            )}

            <AnimatePresence>
              {breakChunk && (
                <motion.div
                  initial={reduceMotion ? false : { opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                  className="flex flex-col gap-3 rounded-2xl border border-gold-line bg-gold-soft/60 p-4 sm:flex-row sm:items-center"
                  role="dialog"
                  aria-label="הפסקה לתרגול"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gold text-white" aria-hidden>
                    <CirclePause size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      סיימת את חלק {breakChunk.ordinal + 1}: {breakChunk.title}
                    </p>
                    <p className="text-xs text-muted">זה הרגע הטוב ביותר לעצור ולתרגל — כשהדברים עוד טריים.</p>
                  </div>
                  <div className="flex gap-2">
                    <ActionPill
                      icon={Target}
                      variant="gold"
                      onClick={() => router.push(`/areas/torah/lessons/${lesson.id}/practice?part=${breakChunk.id}`)}
                    >
                      לתרגל עכשיו
                    </ActionPill>
                    <ActionPill
                      icon={Headphones}
                      onClick={() => {
                        dismissedBreaks.current.add(breakChunk.id);
                        setBreakChunk(null);
                        player.current?.play();
                      }}
                    >
                      להמשיך להאזין
                    </ActionPill>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div role="tablist" aria-label="תוכן השיעור" className="flex gap-1.5">
              {(
                [
                  { key: "transcript", label: "תמלול", icon: NotebookPen },
                  { key: "summary", label: "סיכום", icon: Sparkles, hidden: !ready },
                  { key: "chapters", label: "פרקים", icon: ListOrdered, hidden: lesson.chapters.length === 0 },
                ] as const
              )
                .filter((t) => !("hidden" in t && t.hidden))
                .map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      role="tab"
                      aria-selected={tab === t.key}
                      onClick={() => setTab(t.key)}
                      className={cn(
                        "focus-ring flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors",
                        tab === t.key ? "bg-foreground text-background" : "bg-fill-subtle text-muted hover:text-foreground"
                      )}
                    >
                      <Icon size={14} aria-hidden />
                      {t.label}
                    </button>
                  );
                })}
            </div>

            {tab === "transcript" && (
              <InteractiveTranscript lines={lesson.transcript} chapters={lesson.chapters} currentTime={currentTime} onSeek={seek} />
            )}
            {tab === "summary" && ready && <SummaryView lesson={lesson} />}
            {tab === "chapters" && (
              <ChaptersView lesson={lesson} currentTime={currentTime} playing={playing} onSeek={seek} />
            )}
          </div>

          <aside className="flex min-w-0 flex-col gap-5" aria-label="מקורות וחלקי לימוד">
            {ready && lesson.chunks.length > 0 && <PartsCard lesson={lesson} currentTime={currentTime} onSeek={seek} />}
            {ready && <HavrutaSection subjectType="lesson" subjectId={lesson.id} subjectTitle={lesson.title} />}
            <PageSection id="sources" icon={Library} tone="faith" title="מקורות מהשיעור" subtitle="פסוקים, גמרות והלכות שצוטטו">
              {ready ? (
                <SourcesPanel sources={lesson.sources} onSeek={seek} onLibraryChanged={() => void reload()} />
              ) : (
                <p className="text-xs text-muted">המקורות יאותרו אחרי שהתמלול יסתיים.</p>
              )}
            </PageSection>
            <AudioAttachmentWidget entityType="lesson" entityId={lesson.id} entityLabel={lesson.title} />
          </aside>
        </div>
      )}
    </main>
  );
}

function BackLink() {
  return (
    <Link
      href="/areas/torah?tab=shiurim"
      className="focus-ring glass-control-hover inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
    >
      <ArrowRight size={14} aria-hidden />
      שיעורים
    </Link>
  );
}

function SummaryView({ lesson }: { lesson: LessonDetail }) {
  if (!lesson.summary && lesson.keyPoints.length === 0) {
    return <SectionPlaceholder icon={Sparkles} title="אין סיכום לשיעור" body="הסיכום נוצר כשמפתח AI מחובר." />;
  }
  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-hairline-card bg-surface p-5">
      {lesson.summary && (
        <div className="flex flex-col gap-3">
          {lesson.summary.split(/\n\s*\n/).map((paragraph, i) => (
            <p key={i} className="text-[0.95rem] leading-8 text-foreground/85">
              {paragraph.trim()}
            </p>
          ))}
        </div>
      )}
      {lesson.keyPoints.length > 0 && (
        <div className="border-t border-hairline-card pt-4">
          <p className="mb-3 text-xs font-medium text-muted">נקודות מרכזיות</p>
          <ol className="flex flex-col gap-2.5">
            {lesson.keyPoints.map((point, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed text-foreground/85">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-gold-soft text-[0.65rem] font-semibold text-gold-ink">
                  {i + 1}
                </span>
                {point}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function ChaptersView({
  lesson,
  currentTime,
  playing,
  onSeek,
}: {
  lesson: LessonDetail;
  currentTime: number;
  playing: boolean;
  onSeek: (seconds: number) => void;
}) {
  const activeIndex = useMemo(() => {
    let index = -1;
    lesson.chapters.forEach((chapter, i) => {
      if (chapter.startSeconds <= currentTime) index = i;
    });
    return index;
  }, [lesson.chapters, currentTime]);

  return (
    <ol className="flex flex-col gap-2">
      {lesson.chapters.map((chapter, index) => (
        <li key={chapter.id}>
          <button
            type="button"
            onClick={() => onSeek(chapter.startSeconds)}
            className={cn(
              "focus-ring flex w-full items-start gap-3 rounded-2xl border p-3.5 text-start transition-colors",
              index === activeIndex ? "border-gold-line bg-gold-soft/60" : "border-hairline-card bg-surface hover:border-gold-line"
            )}
          >
            <span className="ltr mt-0.5 rounded-lg bg-surface-sunken px-2 py-1 text-xs font-medium tabular-nums text-gold-ink">
              {formatTimecode(chapter.startSeconds)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                {chapter.title}
                {index === activeIndex && playing && (
                  <span className="rounded-full bg-gold px-1.5 py-px text-[0.6rem] font-medium text-white">מתנגן</span>
                )}
              </span>
              {chapter.summary && <span className="mt-0.5 block text-xs leading-relaxed text-muted">{chapter.summary}</span>}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function PartsCard({ lesson, currentTime, onSeek }: { lesson: LessonDetail; currentTime: number; onSeek: (s: number) => void }) {
  const done = lesson.chunks.filter((c) => c.completedAt).length;
  const fraction = lesson.chunks.length ? done / lesson.chunks.length : 0;
  return (
    <PageSection id="parts" icon={Target} tone="gold" title="חלקי לימוד ותרגול" subtitle={`${done} מתוך ${lesson.chunks.length} חלקים תורגלו`}>
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-fill">
        <div className="h-full rounded-full bg-gradient-to-l from-gold to-gold-ink transition-[width]" style={{ width: `${fraction * 100}%` }} />
      </div>
      <ol className="flex flex-col gap-2">
        {lesson.chunks.map((chunk) => {
          const current =
            chunk.startSeconds !== null &&
            currentTime >= chunk.startSeconds &&
            (chunk.endSeconds === null || currentTime < chunk.endSeconds);
          return (
            <li
              key={chunk.id}
              className={cn(
                "flex items-center gap-3 rounded-xl border p-2.5",
                current ? "border-gold-line bg-gold-soft/40" : "border-hairline-card"
              )}
            >
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
                  chunk.completedAt ? "bg-accent-health text-white" : "bg-fill text-foreground/70"
                )}
                aria-label={chunk.completedAt ? "תורגל" : undefined}
              >
                {chunk.completedAt ? <Check size={13} aria-hidden /> : chunk.ordinal + 1}
              </span>
              <button
                type="button"
                onClick={() => chunk.startSeconds !== null && onSeek(chunk.startSeconds)}
                className="focus-ring min-w-0 flex-1 text-start"
              >
                <span className="block truncate text-sm text-foreground">{chunk.title}</span>
                {chunk.startSeconds !== null && (
                  <span className="ltr block text-[0.65rem] tabular-nums text-muted">
                    {formatTimecode(chunk.startSeconds)}
                    {chunk.endSeconds !== null && `–${formatTimecode(chunk.endSeconds)}`}
                  </span>
                )}
              </button>
              <Link
                href={`/areas/torah/lessons/${lesson.id}/practice?part=${chunk.id}`}
                className="focus-ring shrink-0 rounded-full border border-hairline-card px-2.5 py-1 text-xs text-foreground/80 hover:border-gold-line"
              >
                {chunk.completedAt ? "חזרה" : "תרגול"}
              </Link>
            </li>
          );
        })}
      </ol>
    </PageSection>
  );
}

function LogToJournal({ lesson, onLogged }: { lesson: LessonDetail; onLogged: (entryId: string) => void }) {
  const addKnowledgeEntry = useAtlasStore((s) => s.addKnowledgeEntry);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (lesson.knowledgeEntryId) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline-card px-3 py-1.5 text-xs text-muted">
        <Check size={13} className="text-accent-health" aria-hidden />
        נרשם ביומן הלימוד
      </span>
    );
  }

  return (
    <>
      <ActionPill
        icon={saving ? Loader2 : BookmarkPlus}
        busy={saving}
        onClick={async () => {
          setSaving(true);
          setError(null);
          try {
            await addKnowledgeEntry({
              date: new Date().toISOString().slice(0, 10),
              topic: lesson.title,
              source: lesson.speaker ?? (lesson.kind === "youtube" ? "YouTube" : "שיעור שמע"),
              summary: (lesson.summary ?? lesson.keyPoints.join(" ")).slice(0, 1200),
              durationMinutes: lesson.durationSeconds ? Math.round(lesson.durationSeconds / 60) : undefined,
            });
            // The store prepends the created entry.
            const entry = useAtlasStore.getState().knowledgeEntries[0];
            if (entry) {
              await fetch(`/api/torah/lessons/${lesson.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ knowledgeEntryId: entry.id }),
              });
              onLogged(entry.id);
            }
          } catch {
            setError("הרישום נכשל");
          } finally {
            setSaving(false);
          }
        }}
      >
        רשום ביומן הלימוד
      </ActionPill>
      {error && <span className="self-center text-xs text-accent-family">{error}</span>}
    </>
  );
}

function DeleteLesson({ lessonId }: { lessonId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 6000);
    return () => clearTimeout(timer);
  }, [confirming]);

  return (
    <ActionPill
      icon={deleting ? Loader2 : Trash2}
      busy={deleting}
      onClick={async () => {
        if (!confirming) {
          setConfirming(true);
          return;
        }
        setDeleting(true);
        const response = await fetch(`/api/torah/lessons/${lessonId}`, { method: "DELETE" }).catch(() => null);
        if (response?.ok) router.push("/areas/torah?tab=shiurim");
        else setDeleting(false);
      }}
    >
      {confirming ? "ללחוץ שוב כדי למחוק" : "מחק"}
    </ActionPill>
  );
}
