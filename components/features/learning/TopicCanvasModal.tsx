"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, GraduationCap, Trash2, X } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { ContinueLearning } from "@/components/features/learning/ContinueLearning";
import { EmbeddedCinema } from "@/components/features/learning/EmbeddedCinema";
import { LearningSplitView } from "@/components/features/learning/LearningSplitView";
import { MasterclassLessonDrawer } from "@/components/features/learning/MasterclassLessonDrawer";
import { StudyModes } from "@/components/features/learning/StudyModes";
import { SyllabusQuest } from "@/components/features/learning/SyllabusQuest";
import { TutorBox } from "@/components/features/learning/TutorBox";
import { STATUS_CYCLE, STATUS_LABEL } from "@/components/features/learning/lab/labels";
import { useLabReducedMotion } from "@/components/features/learning/lab/useLabMotion";
import { useResourceCompletion } from "@/components/features/learning/lab/useResourceCompletion";
import { GoalTaskLink } from "@/components/features/learning/lab/GoalTaskLink";
import { parseVideoInput } from "@/lib/learning/youtubeInput";
import { topicProgress, topicXp } from "@/lib/learning/xp";
import { cn } from "@/lib/utils";
import type { LearningResource } from "@/types";

interface TopicCanvasModalProps {
  topicId: string;
  onClose: () => void;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The topic, opened.
 *
 * The card the person clicked *is* this panel: both carry `layoutId="topic-<id>"`,
 * so the card grows into the canvas on a spring instead of a new screen
 * appearing. The content fades in once the frame has arrived.
 *
 * It is a real dialog: it renders into <body> (see Portal), locks the page
 * behind it, traps Tab, closes on Escape or a click outside, and hands focus back
 * to what opened it.
 */
export function TopicCanvasModal({ topicId, onClose }: TopicCanvasModalProps) {
  const reduce = useLabReducedMotion();
  const topic = useAtlasStore((s) => s.learningTopics.find((t) => t.id === topicId));
  const allResources = useAtlasStore((s) => s.learningResources);
  const updateLearningTopic = useAtlasStore((s) => s.updateLearningTopic);
  const deleteLearningTopic = useAtlasStore((s) => s.deleteLearningTopic);
  const complete = useResourceCompletion();

  const resources = useMemo(() => allResources.filter((r) => r.topicId === topicId), [allResources, topicId]);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const firstVideo = useMemo(() => resources.find((r) => r.type === "youtube" && r.url && parseVideoInput(r.url)) ?? null, [resources]);
  const [playingId, setPlayingId] = useState<string | null>(firstVideo?.id ?? null);
  const [theater, setTheater] = useState(false);
  const [deepStudy, setDeepStudy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lessonResourceId, setLessonResourceId] = useState<string | null>(null);
  const lessonResource = resources.find((r) => r.id === lessonResourceId) ?? null;

  // If the video that was playing goes away (deleted), fall back to another.
  const playing: LearningResource | null = resources.find((r) => r.id === playingId && r.url && parseVideoInput(r.url)) ?? firstVideo;
  const video = playing?.url ? parseVideoInput(playing.url) : null;

  // The topic can disappear from under us (deleted here, or elsewhere).
  useEffect(() => {
    if (!topic) onClose();
  }, [topic, onClose]);

  // Dialog behaviour: lock scroll, remember and restore focus, Escape, Tab trap.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const scrollBefore = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = [...(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((n) => n.offsetParent !== null);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panelRef.current?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panelRef.current?.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = scrollBefore;
      opener?.focus?.();
    };
  }, [onClose]);

  const onWatched = useCallback(() => {
    if (playing && !playing.isCompleted) complete(playing, true).catch(() => setError("לא הצלחנו לסמן את הסרטון כהושלם."));
  }, [playing, complete]);

  if (!topic) return null;

  const progress = topicProgress(resources);
  const xp = topicXp(resources);
  const firstYoutubeUrl = resources.find((r) => r.type === "youtube" && r.url)?.url;

  // Portalled straight away rather than through <Portal>, which waits a commit to
  // mount: this only ever renders after a click (never on the server), and the
  // dialog effects above need the panel and its close button to exist already.
  return createPortal(
    <>
      <div className="fixed inset-0 z-[120]">
        <motion.div
          aria-hidden
          className="absolute inset-0 bg-black/60"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={onClose}
        />

        <motion.div
          ref={panelRef}
          layoutId={`topic-${topic.id}`}
          role="dialog"
          aria-modal="true"
          aria-label={`הנושא: ${topic.title}`}
          transition={{ layout: { type: "spring", bounce: 0.1, duration: reduce ? 0.01 : 0.6 } }}
          style={{ borderRadius: 28 }}
          className="absolute inset-2 flex flex-col overflow-hidden bg-surface shadow-[0_40px_120px_-30px_rgba(0,0,0,0.6)] sm:inset-5 lg:inset-x-[6%] lg:inset-y-5"
        >
          <motion.div
            className="flex min-h-0 flex-1 flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { delay: reduce ? 0 : 0.22, duration: 0.3 } }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
          >
            <header className="flex items-center gap-4 border-b border-hairline-card px-5 py-4 sm:px-7">
              <ProgressRing value={progress.fraction} size={56} stroke={5} color="var(--accent-learning)" label={`${progress.done} מתוך ${progress.total} שלבים הושלמו`}>
                <span className="ltr text-[0.7rem] font-bold tabular-nums text-foreground">
                  <NumberTicker value={Math.round(progress.fraction * 100)} />%
                </span>
              </ProgressRing>

              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-semibold text-foreground sm:text-xl">{topic.title}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  {topic.category && <span className="rounded-full bg-fill-subtle px-2 py-0.5 text-[10px] text-muted">{topic.category}</span>}
                  <button
                    onClick={() => updateLearningTopic(topic.id, { status: STATUS_CYCLE[topic.status] }).catch(() => undefined)}
                    aria-label={`סטטוס: ${STATUS_LABEL[topic.status]}. לחץ כדי לשנות`}
                    className="focus-ring rounded-full bg-accent-learning/15 px-2.5 py-0.5 text-[10px] font-medium text-accent-learning transition-opacity hover:opacity-80"
                  >
                    {STATUS_LABEL[topic.status]}
                  </button>
                  {xp > 0 && <span className="font-semibold text-gold-ink">{xp} XP</span>}
                </div>
              </div>

              {confirmingDelete ? (
                <div className="flex items-center gap-2 text-xs">
                  <button
                    onClick={() => deleteLearningTopic(topic.id).catch(() => setError("המחיקה לא נשמרה."))}
                    className="focus-ring rounded-lg bg-accent-family/20 px-2.5 py-1 font-medium text-accent-family"
                  >
                    מחק נושא
                  </button>
                  <button onClick={() => setConfirmingDelete(false)} className="focus-ring text-muted hover:text-foreground">
                    ביטול
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmingDelete(true)}
                  aria-label="מחק את הנושא"
                  className="focus-ring hidden rounded-full p-2 text-muted transition-colors hover:text-accent-family sm:block"
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              )}

              <button
                ref={closeRef}
                onClick={onClose}
                aria-label="סגור"
                className="focus-ring grid size-9 shrink-0 place-items-center rounded-full bg-fill-subtle text-muted transition-colors hover:text-foreground"
              >
                <X size={18} aria-hidden />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
              <div className="mb-5">
                <GoalTaskLink topicTitle={topic.title} nextStepTitle={resources.find((r) => !r.isCompleted)?.title} />
              </div>

              <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                {video && playing && (
                  <motion.div layout={!reduce} transition={{ type: "spring", bounce: 0.1, duration: 0.5 }} className={cn(theater && "lg:col-span-2")}>
                    <EmbeddedCinema
                      videoId={video.videoId}
                      title={playing.title}
                      startSeconds={video.startSeconds}
                      alreadyWatched={playing.isCompleted}
                      onWatched={onWatched}
                      theater={theater}
                      onToggleTheater={() => setTheater((v) => !v)}
                    />
                  </motion.div>
                )}

                <motion.div layout={!reduce} className={cn("flex flex-col gap-6", !video && "lg:order-2")}>
                  <SyllabusQuest
                    topic={topic}
                    resources={resources}
                    playingId={playing?.id ?? null}
                    onPlayVideo={(r) => setPlayingId(r.id)}
                    onOpenLesson={(r) => setLessonResourceId(r.id)}
                  />
                </motion.div>

                <motion.div layout={!reduce} className={cn(!video && "lg:order-1")}>
                  <TutorBox topicTitle={topic.title} resourceTitles={resources.map((r) => r.title)} />
                </motion.div>
              </div>

              {/* The existing AI study stack — summary, quiz, roadmap — kept whole
                  and opened on demand, so the canvas stays light. */}
              <div className="mt-8 border-t border-hairline-card pt-5">
                <button
                  onClick={() => setDeepStudy((v) => !v)}
                  aria-expanded={deepStudy}
                  className="focus-ring flex w-full items-center justify-between gap-2 rounded-xl px-1 py-1 text-start"
                >
                  <span className="flex items-center gap-2 text-base font-semibold text-foreground">
                    <GraduationCap size={17} className="text-accent-learning" aria-hidden />
                    לימוד מעמיק עם AI
                    <span className="text-xs font-normal text-muted">סיכום, מבחן ומפת דרכים</span>
                  </span>
                  <motion.span animate={{ rotate: deepStudy ? 180 : 0 }} transition={{ type: "spring", bounce: 0.45, duration: 0.5 }}>
                    <ChevronDown size={18} className="text-muted" aria-hidden />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {deepStudy && (
                    <motion.div key="deep" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4">
                      <StudyModes topicId={topic.id} topicTitle={topic.title} videoUrl={firstYoutubeUrl}>
                        <LearningSplitView
                          topicTitle={topic.title}
                          videoUrl={firstYoutubeUrl}
                          onQuizComplete={() => {
                            // Finishing the quiz completes the topic's video — with the same celebration a tick gets.
                            const next = resources.find((r) => r.type === "youtube" && !r.isCompleted);
                            if (next) complete(next, true).catch(() => undefined);
                          }}
                          onClose={() => setDeepStudy(false)}
                        />
                        <div className="mt-5">
                          <ContinueLearning topic={topic} />
                        </div>
                      </StudyModes>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {error && (
                <p role="alert" className="mt-4 text-xs text-accent-family">
                  {error}
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      </div>

      {lessonResource && <MasterclassLessonDrawer topic={topic} resource={lessonResource} onClose={() => setLessonResourceId(null)} />}
    </>,
    document.body
  );
}
