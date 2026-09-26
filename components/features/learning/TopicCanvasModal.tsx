"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, GraduationCap, MessageCircleQuestion, Sparkles, Timer, Trash2, X } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { EmbeddedCinema } from "@/components/features/learning/EmbeddedCinema";
import { SyllabusQuest } from "@/components/features/learning/SyllabusQuest";
import { TutorDrawer } from "@/components/features/learning/TutorDrawer";
import { StepPreview } from "@/components/features/learning/step/StepPreview";
import { peekStepBrief } from "@/components/features/learning/step/useStepBrief";
import { STATUS_CYCLE, STATUS_LABEL } from "@/components/features/learning/lab/labels";
import { focusableIn, isOwnLayerEvent } from "@/components/features/learning/lab/useFocusTrap";
import { useLabReducedMotion } from "@/components/features/learning/lab/useLabMotion";
import { useResourceCompletion } from "@/components/features/learning/lab/useResourceCompletion";
import { GoalTaskLink } from "@/components/features/learning/lab/GoalTaskLink";
import { parseVideoInput } from "@/lib/learning/youtubeInput";
import { topicProgress, topicXp } from "@/lib/learning/xp";
import { cn } from "@/lib/utils";
import type { LearningResource } from "@/types";

// Code-split: none of these are needed for the canvas's first paint. The
// classroom and the deep-study stack only mount on an explicit click, and the
// focus timer only when its popover opens.
const ClassroomViewport = dynamic(() => import("@/components/features/learning/classroom/ClassroomViewport").then((m) => m.ClassroomViewport), { ssr: false });
const StudyModes = dynamic(() => import("@/components/features/learning/StudyModes").then((m) => m.StudyModes), { ssr: false });
const LearningSplitView = dynamic(() => import("@/components/features/learning/LearningSplitView").then((m) => m.LearningSplitView), { ssr: false });
const ContinueLearning = dynamic(() => import("@/components/features/learning/ContinueLearning").then((m) => m.ContinueLearning), { ssr: false });
const FocusTimer = dynamic(() => import("@/components/features/learning/FocusTimer"), {
  ssr: false,
  loading: () => <div className="h-72 w-80" aria-hidden />,
});

interface TopicCanvasModalProps {
  topicId: string;
  onClose: () => void;
}

/**
 * The topic, opened.
 *
 * The card the person clicked *is* this panel: both carry `layoutId="topic-<id>"`,
 * so the card grows into the canvas on a spring instead of a new screen
 * appearing. The content fades in once the frame has arrived.
 *
 * Layout: the syllabus is a timeline beside a Live Step Content Preview —
 * selecting a step (click, or the arrow keys) renders that step's brief in the
 * main canvas, so the canvas is never an empty column. "שאל על הנושא" is a
 * slide-over drawer, and a Pomodoro focus timer sits in the header.
 *
 * It is a real dialog: it renders into <body> (see Portal), locks the page
 * behind it, traps Tab, closes on Escape or a click outside, and hands focus back
 * to what opened it. Layers on top of it (the tutor drawer, the classroom, a
 * pioneer profile) own their keys — see isOwnLayerEvent.
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

  const firstOpen = useMemo(() => resources.find((r) => !r.isCompleted) ?? resources[0] ?? null, [resources]);
  const [selectedId, setSelectedId] = useState<string | null>(firstOpen?.id ?? null);
  const [theater, setTheater] = useState(false);
  const [deepStudy, setDeepStudy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [classroomStepId, setClassroomStepId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const [tutorOpen, setTutorOpen] = useState(false);
  const [timerOpen, setTimerOpen] = useState(false);
  const [timerMounted, setTimerMounted] = useState(false);
  const tutorId = useId();
  const timerId = useId();
  const timerRef = useRef<HTMLDivElement>(null);
  const timerButtonRef = useRef<HTMLButtonElement>(null);

  // A deleted (or not-yet-loaded) selection falls back to the next step to do.
  const selectedIndex = resources.findIndex((r) => r.id === selectedId);
  const selected: LearningResource | null = selectedIndex === -1 ? firstOpen : resources[selectedIndex];
  const selectedPosition = selected ? resources.indexOf(selected) : -1;
  const video = selected?.type === "youtube" && selected.url ? parseVideoInput(selected.url) : null;

  const mainRef = useRef<HTMLElement>(null);
  const selectStep = useCallback(
    (r: LearningResource, via: "pointer" | "keyboard" = "pointer") => {
      setSelectedId(r.id);
      // On a phone the timeline sits above the canvas: a tap should bring the
      // step into view. Arrow-key browsing stays put on the timeline.
      if (via === "pointer" && window.matchMedia("(max-width: 1023px)").matches) {
        requestAnimationFrame(() => mainRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }));
      }
    },
    [reduce]
  );
  const openLesson = useCallback((r: LearningResource) => setClassroomStepId(r.id), []);
  const closeTutor = useCallback(() => setTutorOpen(false), []);

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
      // A drawer, the classroom or a profile modal on top handles its own keys.
      if (!isOwnLayerEvent(panelRef.current, e)) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = focusableIn(panelRef.current);
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

  // The focus-timer popover: Escape or a click outside closes it (and only it).
  useEffect(() => {
    if (!timerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || !timerRef.current?.contains(e.target as Node)) return;
      e.stopPropagation();
      setTimerOpen(false);
      timerButtonRef.current?.focus();
    }
    function onPointer(e: PointerEvent) {
      const t = e.target as Node;
      if (!timerRef.current?.contains(t) && !timerButtonRef.current?.contains(t)) setTimerOpen(false);
    }
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [timerOpen]);

  const onWatched = useCallback(() => {
    if (selected && !selected.isCompleted) complete(selected, true).catch(() => setError("לא הצלחנו לסמן את הסרטון כהושלם."));
  }, [selected, complete]);

  const personas = useMemo(() => (tutorOpen ? (peekStepBrief(queryClient, selected?.id)?.keyFigures ?? []) : []), [queryClient, tutorOpen, selected?.id]);
  const resourceTitles = useMemo(() => resources.map((r) => r.title), [resources]);

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
              <ProgressRing className="hidden sm:grid" value={progress.fraction} size={56} stroke={5} color="var(--accent-learning)" label={`${progress.done} מתוך ${progress.total} שלבים הושלמו`}>
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
                    className="focus-ring min-h-7 rounded-full bg-accent-learning/15 px-2.5 py-0.5 text-[11px] font-medium text-accent-learning transition-opacity hover:opacity-80"
                  >
                    {STATUS_LABEL[topic.status]}
                  </button>
                  {xp > 0 && <span className="font-semibold text-gold-ink">{xp} XP</span>}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setTutorOpen(true)}
                aria-expanded={tutorOpen}
                aria-controls={tutorId}
                className="focus-ring flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-accent-learning/15 px-3.5 text-sm font-medium text-accent-learning transition-opacity hover:opacity-80"
              >
                <MessageCircleQuestion size={16} aria-hidden />
                <span className="hidden sm:inline">שאל על הנושא</span>
              </button>

              <div className="relative shrink-0">
                <button
                  ref={timerButtonRef}
                  type="button"
                  onClick={() => {
                    setTimerMounted(true);
                    setTimerOpen((v) => !v);
                  }}
                  aria-expanded={timerOpen}
                  aria-controls={timerId}
                  aria-label="טיימר ריכוז וצלילי רקע"
                  className={cn(
                    "focus-ring grid size-11 place-items-center rounded-full transition-colors",
                    timerOpen ? "bg-accent-learning/15 text-accent-learning" : "bg-fill-subtle text-muted hover:text-foreground"
                  )}
                >
                  <Timer size={17} aria-hidden />
                </button>
                {/* Mounted on first open and then only hidden, so a running
                    session (and its ambient sound) survives closing the popover. */}
                {timerMounted && (
                  <div
                    ref={timerRef}
                    id={timerId}
                    role="region"
                    aria-label="טיימר ריכוז"
                    hidden={!timerOpen}
                    className={cn(
                      "absolute end-0 top-full z-30 mt-2 origin-top-left rounded-2xl border border-hairline-card bg-surface shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)]",
                      !reduce && "animate-mac-launch"
                    )}
                  >
                    <FocusTimer />
                  </div>
                )}
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
                  className="focus-ring hidden size-11 place-items-center rounded-full text-muted transition-colors hover:text-accent-family sm:grid"
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              )}

              <button
                ref={closeRef}
                onClick={onClose}
                aria-label="סגור"
                className="focus-ring grid size-11 shrink-0 place-items-center rounded-full bg-fill-subtle text-muted transition-colors hover:text-foreground"
              >
                <X size={18} aria-hidden />
              </button>
            </header>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(19rem,24rem)] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
              {/* The main canvas (right, in RTL): the selected step, live. */}
              <main ref={mainRef} className="order-2 min-w-0 scroll-mt-2 px-5 py-6 sm:px-8 lg:order-1 lg:overflow-y-auto">
                {selected ? (
                  <StepPreview
                    key={selected.id}
                    topic={topic}
                    resource={selected}
                    index={selectedPosition}
                    total={resources.length}
                    onOpenLesson={openLesson}
                    media={
                      video ? (
                        <div className={cn(!theater && "max-w-3xl")}>
                          <EmbeddedCinema
                            videoId={video.videoId}
                            title={selected.title}
                            startSeconds={video.startSeconds}
                            alreadyWatched={selected.isCompleted}
                            onWatched={onWatched}
                            theater={theater}
                            onToggleTheater={() => setTheater((v) => !v)}
                          />
                        </div>
                      ) : undefined
                    }
                  />
                ) : (
                  <EmptyCanvas />
                )}

                {/* The existing AI study stack — summary, quiz, roadmap — kept whole
                    and opened on demand (and code-split), so the canvas stays light. */}
                <div className="mt-10 border-t border-hairline-card pt-5">
                  <button
                    onClick={() => setDeepStudy((v) => !v)}
                    aria-expanded={deepStudy}
                    aria-controls={`${tutorId}-deep`}
                    className="focus-ring flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-1 py-1 text-start"
                  >
                    <span className="flex items-center gap-2 text-base font-semibold text-foreground">
                      <GraduationCap size={17} className="text-accent-learning" aria-hidden />
                      לימוד מעמיק עם AI
                      <span className="text-xs font-normal text-muted">סיכום, מבחן ומפת דרכים לכל הנושא</span>
                    </span>
                    <ChevronDown size={18} className={cn("text-muted transition-transform duration-300", deepStudy && "rotate-180")} aria-hidden />
                  </button>
                  <div id={`${tutorId}-deep`} hidden={!deepStudy}>
                    {deepStudy && (
                      <motion.div initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
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
                  </div>
                </div>

                {error && (
                  <p role="alert" className="mt-4 text-xs text-accent-family">
                    {error}
                  </p>
                )}
              </main>

              {/* The timeline (left, in RTL). First on a phone, so the path is
                  what you see before scrolling into the step. */}
              <aside aria-label="ציר הזמן של הנושא" className="order-1 flex flex-col gap-5 border-b border-hairline-card px-5 py-5 lg:order-2 lg:overflow-y-auto lg:border-b-0 lg:border-s">
                <SyllabusQuest topic={topic} resources={resources} selectedId={selected?.id ?? null} onSelect={selectStep} onOpenLesson={openLesson} />
                <GoalTaskLink topicTitle={topic.title} nextStepTitle={resources.find((r) => !r.isCompleted)?.title} />
              </aside>
            </div>

            <AnimatePresence>
              {tutorOpen && (
                <TutorDrawer
                  key="tutor"
                  id={tutorId}
                  topicTitle={topic.title}
                  resourceTitles={resourceTitles}
                  stepTitle={selected?.title}
                  personas={personas}
                  onClose={closeTutor}
                />
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      </div>

      {classroomStepId && <ClassroomViewport topic={topic} resources={resources} initialStepId={classroomStepId} onClose={onClose} />}
    </>,
    document.body
  );
}

function EmptyCanvas() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-hairline-card px-6 py-14 text-center">
      <Sparkles size={26} className="text-accent-learning" aria-hidden />
      <p className="text-base font-semibold text-foreground">עוד אין שלבים בנושא הזה</p>
      <p className="max-w-sm text-sm text-muted">בנה מסלול בציר הזמן, ובחר שלב כדי לראות כאן את התקציר שלו, מושגי היסוד, תרשים, בדיקות הבנה ומשימה מעשית.</p>
    </div>
  );
}
