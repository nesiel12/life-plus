"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import confetti from "canvas-confetti";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Flame,
  GitCompareArrows,
  Layers,
  Lightbulb,
  Loader2,
  PartyPopper,
  PenLine,
  Scale,
  Sparkles,
  Swords,
  Target,
  Trophy,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { ActionPill, SectionPlaceholder } from "@/components/features/torah/hub/PageSection";
import { HavrutaHint } from "@/components/features/torah/practice/HavrutaHint";
import { readyForChallenge } from "@/lib/torah/adaptive";
import { FlashcardDeck } from "@/components/features/torah/lessons/FlashcardDeck";
import { StatsStrip } from "@/components/features/torah/lessons/StatsStrip";
import { useLesson } from "@/components/features/torah/lessons/useLesson";
import { usePracticeStats } from "@/components/features/torah/lessons/usePracticeStats";
import { formatTimecode } from "@/lib/torah/lessons/timecode";
import { XP } from "@/lib/torah/practiceStats";
import type { FlashcardView, LearningChunkView, PracticeQuestionView } from "@/lib/torah/lessons/types";
import { cn } from "@/lib/utils";

type Phase = "learn" | "questions" | "cards" | "done";

const PHASES: { key: Phase; label: string; icon: LucideIcon }[] = [
  { key: "learn", label: "לימוד", icon: BookOpenCheck },
  { key: "questions", label: "שאלות", icon: PenLine },
  { key: "cards", label: "כרטיסיות", icon: Layers },
  { key: "done", label: "סיום", icon: Trophy },
];

const KIND_LABELS: Record<PracticeQuestionView["kind"], { label: string; icon: LucideIcon }> = {
  dilemma: { label: "דילמה תלמודית", icon: Scale },
  counter: { label: "קושיא להשיב עליה", icon: Swords },
  scenario: { label: "תרחיש", icon: Lightbulb },
  application: { label: "יישום", icon: Target },
  compare: { label: "השוואה", icon: GitCompareArrows },
  recall: { label: "זיכרון", icon: BookOpenCheck },
};

interface PracticeSet {
  questions: PracticeQuestionView[];
  flashcards: FlashcardView[];
}

/**
 * "לתרגל" for one lesson: part by part, learn → answer → review → done.
 *
 * Deep questions first (a scenario, an application, a comparison), graded
 * against a rubric with the reasoning shown; then the part's flashcards get
 * their first review, which is what starts their spaced-repetition schedule.
 * Completing a part is the one moment with a celebration — calm the rest of
 * the time, so that it means something.
 */
export function LessonPractice({ lessonId }: { lessonId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reduceMotion = useReducedMotion();
  const { lesson, setLesson, loading } = useLesson(lessonId);
  const { stats, reload: reloadStats } = usePracticeStats(lessonId);

  const [chunkId, setChunkId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("learn");
  const [practice, setPractice] = useState<PracticeSet | null>(null);
  const [practiceError, setPracticeError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [completing, setCompleting] = useState(false);

  // Start on the part the link asked for, or the first unfinished one.
  useEffect(() => {
    if (!lesson || chunkId) return;
    const requested = searchParams.get("part");
    const target =
      lesson.chunks.find((c) => c.id === requested) ?? lesson.chunks.find((c) => !c.completedAt) ?? lesson.chunks[0];
    if (target) setChunkId(target.id);
  }, [lesson, chunkId, searchParams]);

  const chunk = lesson?.chunks.find((c) => c.id === chunkId) ?? null;
  const chunkIndex = lesson && chunk ? lesson.chunks.indexOf(chunk) : -1;

  const openChunk = useCallback((id: string) => {
    setChunkId(id);
    setPhase("learn");
    setPractice(null);
    setPracticeError(null);
    setQuestionIndex(0);
  }, []);

  async function preparePractice() {
    if (!chunk) return;
    setPhase("questions");
    if (practice) return;
    setPreparing(true);
    setPracticeError(null);
    try {
      const response = await fetch(`/api/torah/lessons/${lessonId}/chunks/${chunk.id}/practice`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "יצירת התרגול נכשלה.");
      setPractice({ questions: data.questions, flashcards: data.flashcards });
      const firstUnanswered = (data.questions as PracticeQuestionView[]).findIndex((q) => !q.latestAttempt);
      setQuestionIndex(firstUnanswered === -1 ? 0 : firstUnanswered);
    } catch (err) {
      setPracticeError(err instanceof Error ? err.message : "יצירת התרגול נכשלה.");
    } finally {
      setPreparing(false);
    }
  }

  // "אתגר קשה יותר" — two harder questions, appended, once the part is mastered.
  const [challenging, setChallenging] = useState(false);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  async function requestChallenge() {
    if (!chunk || !practice) return;
    setChallenging(true);
    setChallengeError(null);
    try {
      const response = await fetch(`/api/torah/lessons/${lessonId}/chunks/${chunk.id}/practice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "יצירת האתגר נכשלה.");
      const before = practice.questions.length;
      setPractice({ questions: data.questions, flashcards: data.flashcards });
      setQuestionIndex(Math.min(before, data.questions.length - 1));
    } catch (err) {
      setChallengeError(err instanceof Error ? err.message : "יצירת האתגר נכשלה.");
    } finally {
      setChallenging(false);
    }
  }

  async function completeChunk() {
    if (!chunk || !lesson) return;
    setCompleting(true);
    try {
      const response = await fetch(`/api/torah/lessons/${lessonId}/chunks/${chunk.id}/complete`, { method: "POST" });
      const data = await response.json();
      if (response.ok) {
        setLesson({ ...lesson, chunks: lesson.chunks.map((c) => (c.id === chunk.id ? data.chunk : c)) });
        if (data.firstCompletion && !reduceMotion) {
          void confetti({ particleCount: 90, spread: 70, origin: { y: 0.3 }, colors: ["#b89355", "#e6d5ad", "#1a72bb", "#2f9e44"] });
        }
        void reloadStats();
      }
      setPhase("done");
    } finally {
      setCompleting(false);
    }
  }

  if (loading && !lesson) {
    return (
      <main className="min-h-screen px-4 py-10 sm:px-10 lg:px-16">
        <p className="flex items-center gap-2 text-sm text-muted" role="status">
          <Loader2 size={15} className="animate-spin" aria-hidden />
          טוען את התרגול…
        </p>
      </main>
    );
  }

  if (!lesson || lesson.status !== "ready" || lesson.chunks.length === 0) {
    return (
      <main className="min-h-screen px-4 py-10 sm:px-10 lg:px-16">
        <SectionPlaceholder
          icon={Target}
          title={lesson ? "השיעור עדיין לא מוכן לתרגול" : "השיעור לא נמצא"}
          body={lesson ? "התרגול נבנה מהתמלול — הוא יהיה זמין כשעיבוד השיעור יסתיים." : undefined}
        >
          <Link href={lesson ? `/areas/torah/lessons/${lesson.id}` : "/areas/torah?tab=shiurim"} className="focus-ring rounded-full bg-gold px-3 py-1.5 text-xs text-white">
            חזרה לשיעור
          </Link>
        </SectionPlaceholder>
      </main>
    );
  }

  const nextChunk = lesson.chunks[chunkIndex + 1];
  const allDone = lesson.chunks.every((c) => c.completedAt);

  return (
    <main className="min-h-screen px-4 py-10 sm:px-10 sm:py-14 lg:px-16">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/areas/torah/lessons/${lesson.id}`}
          className="focus-ring glass-control-hover inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted hover:text-foreground"
        >
          <ArrowRight size={14} aria-hidden />
          חזרה לשיעור
        </Link>
        <Link
          href="/areas/torah/practice"
          className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-hairline-card px-3 py-1.5 text-xs text-foreground/80 hover:border-gold-line"
        >
          <Layers size={13} aria-hidden />
          כל הכרטיסיות לחזרה
        </Link>
      </div>

      <header className="mb-5 flex flex-col gap-4">
        <div>
          <p className="text-xs font-medium text-gold-ink">תרגול</p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{lesson.title}</h1>
        </div>
        <StatsStrip stats={stats} variant="compact" />
      </header>

      {/* Parts */}
      <nav aria-label="חלקי השיעור" className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {lesson.chunks.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => openChunk(c.id)}
            aria-current={c.id === chunkId ? "step" : undefined}
            className={cn(
              "focus-ring flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2 text-start transition-colors",
              c.id === chunkId ? "border-gold bg-gold-soft" : "border-hairline-card bg-surface hover:border-gold-line"
            )}
          >
            <span
              className={cn(
                "grid size-6 place-items-center rounded-full text-[0.7rem] font-semibold",
                c.completedAt ? "bg-accent-health text-white" : c.id === chunkId ? "bg-gold text-white" : "bg-fill text-foreground/70"
              )}
            >
              {c.completedAt ? <Check size={12} aria-hidden /> : c.ordinal + 1}
            </span>
            <span className="max-w-44 truncate text-sm text-foreground">{c.title}</span>
          </button>
        ))}
      </nav>

      {chunk && (
        <section className="glass-card rounded-3xl p-5 sm:p-7">
          {/* Phase stepper */}
          <ol className="mb-6 flex items-center gap-2" aria-label="שלבי החלק">
            {PHASES.map((p, i) => {
              const Icon = p.icon;
              const current = PHASES.findIndex((x) => x.key === phase);
              return (
                <li key={p.key} className="flex flex-1 items-center gap-2">
                  <span
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs",
                      i < current && "text-accent-health",
                      i === current && "bg-foreground text-background",
                      i > current && "text-muted"
                    )}
                  >
                    {i < current ? <CheckCircle2 size={13} aria-hidden /> : <Icon size={13} aria-hidden />}
                    <span className="hidden sm:inline">{p.label}</span>
                  </span>
                  {i < PHASES.length - 1 && <span className={cn("h-px flex-1", i < current ? "bg-accent-health/50" : "bg-hairline")} />}
                </li>
              );
            })}
          </ol>

          <AnimatePresence mode="wait">
            <motion.div
              key={`${chunk.id}-${phase}`}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
            >
              {phase === "learn" && (
                <LearnPhase lessonId={lesson.id} chunk={chunk} total={lesson.chunks.length} onReady={() => void preparePractice()} />
              )}

              {phase === "questions" && (
                <QuestionsPhase
                  preparing={preparing}
                  error={practiceError}
                  practice={practice}
                  index={questionIndex}
                  onIndex={setQuestionIndex}
                  onRetry={() => void preparePractice()}
                  onAnswered={(question) => {
                    setPractice((p) =>
                      p ? { ...p, questions: p.questions.map((q) => (q.id === question.id ? question : q)) } : p
                    );
                    void reloadStats();
                  }}
                  onContinue={() => setPhase(practice?.flashcards.length ? "cards" : "done")}
                  onChallenge={() => void requestChallenge()}
                  challenging={challenging}
                  challengeError={challengeError}
                />
              )}

              {phase === "cards" && practice && (
                <div className="flex flex-col gap-5">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">כרטיסיות לחזרה מרווחת</h2>
                    <p className="text-sm text-muted">
                      הסבב הראשון על הכרטיסיות של החלק הזה. מכאן הן יחזרו אליך בדיוק כשכדאי — לפי כמה קל היה לך.
                    </p>
                  </div>
                  <FlashcardDeck cards={practice.flashcards} onFinish={() => void reloadStats()} />
                  <div className="flex justify-end">
                    <ActionPill icon={completing ? Loader2 : Trophy} busy={completing} variant="gold" onClick={() => void completeChunk()}>
                      סיים את החלק
                    </ActionPill>
                  </div>
                </div>
              )}

              {phase === "done" && (
                <DonePhase
                  chunk={chunk}
                  allDone={allDone}
                  completing={completing}
                  completed={Boolean(chunk.completedAt)}
                  onComplete={() => void completeChunk()}
                  onNext={nextChunk ? () => openChunk(nextChunk.id) : undefined}
                  onLesson={() => router.push(`/areas/torah/lessons/${lesson.id}`)}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </section>
      )}
    </main>
  );
}

function LearnPhase({
  lessonId,
  chunk,
  total,
  onReady,
}: {
  lessonId: string;
  chunk: LearningChunkView;
  total: number;
  onReady: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs text-muted">
          חלק {chunk.ordinal + 1} מתוך {total}
          {chunk.startSeconds !== null && (
            <span className="ltr ms-2 tabular-nums">
              {formatTimecode(chunk.startSeconds)}
              {chunk.endSeconds !== null && `–${formatTimecode(chunk.endSeconds)}`}
            </span>
          )}
        </p>
        <h2 className="text-xl font-semibold text-foreground">{chunk.title}</h2>
      </div>
      <div className="relative">
        <p className={cn("whitespace-pre-line text-[0.95rem] leading-8 text-foreground/85", !expanded && "line-clamp-[12]")}>
          {chunk.body}
        </p>
        {!expanded && chunk.body.length > 900 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface to-transparent" />
        )}
      </div>
      {chunk.body.length > 900 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="focus-ring flex w-fit items-center gap-1 text-xs text-gold-ink"
          aria-expanded={expanded}
        >
          <ChevronDown size={13} className={cn("transition-transform", expanded && "rotate-180")} aria-hidden />
          {expanded ? "הצג פחות" : "הצג את כל החלק"}
        </button>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline-card pt-4">
        <Link href={`/areas/torah/lessons/${lessonId}`} className="focus-ring text-xs text-muted hover:text-foreground">
          להאזין לחלק הזה בשיעור
        </Link>
        <ActionPill icon={Sparkles} variant="gold" onClick={onReady}>
          למדתי — לשאלות
        </ActionPill>
      </div>
    </div>
  );
}

function QuestionsPhase({
  preparing,
  error,
  practice,
  index,
  onIndex,
  onRetry,
  onAnswered,
  onContinue,
  onChallenge,
  challenging,
  challengeError,
}: {
  preparing: boolean;
  error: string | null;
  practice: PracticeSet | null;
  index: number;
  onIndex: (index: number) => void;
  onRetry: () => void;
  onAnswered: (question: PracticeQuestionView) => void;
  onContinue: () => void;
  onChallenge: () => void;
  challenging: boolean;
  challengeError: string | null;
}) {
  if (preparing) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center" role="status">
        <Loader2 size={24} className="animate-spin text-gold-ink" aria-hidden />
        <p className="text-sm font-medium text-foreground">מכין שאלות מעמיקות על החלק…</p>
        <p className="text-xs text-muted">דילמות, קושיות ויישום מעשי — לא שאלות שינון.</p>
      </div>
    );
  }
  if (error || !practice) {
    return (
      <SectionPlaceholder icon={Target} title="התרגול לא נוצר" body={error ?? undefined}>
        <ActionPill icon={Sparkles} onClick={onRetry} variant="gold">
          נסה שוב
        </ActionPill>
      </SectionPlaceholder>
    );
  }
  if (practice.questions.length === 0) {
    return (
      <SectionPlaceholder icon={Target} title="אין שאלות לחלק הזה">
        <ActionPill icon={ArrowLeft} onClick={onContinue} variant="gold">
          להמשך
        </ActionPill>
      </SectionPlaceholder>
    );
  }

  const question = practice.questions[Math.min(index, practice.questions.length - 1)];
  const answeredCount = practice.questions.filter((q) => q.latestAttempt).length;
  // Adaptive difficulty: mastery of every question so far unlocks a harder pair.
  const canChallenge =
    answeredCount === practice.questions.length &&
    readyForChallenge(practice.questions.map((q) => q.latestAttempt?.score ?? null));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        {practice.questions.map((q, i) => (
          <button
            key={q.id}
            type="button"
            onClick={() => onIndex(i)}
            aria-label={`שאלה ${i + 1}`}
            aria-current={i === index ? "step" : undefined}
            className={cn(
              "focus-ring h-2 flex-1 rounded-full transition-colors",
              q.latestAttempt ? "bg-accent-health" : i === index ? "bg-gold" : "bg-fill"
            )}
          />
        ))}
        <span className="ltr shrink-0 text-xs tabular-nums text-muted">
          {answeredCount}/{practice.questions.length}
        </span>
      </div>

      <QuestionCard key={question.id} question={question} onAnswered={onAnswered} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => onIndex(index - 1)}
          className="focus-ring flex items-center gap-1 text-xs text-muted hover:text-foreground disabled:opacity-30"
        >
          <ArrowRight size={13} aria-hidden />
          הקודמת
        </button>
        {index < practice.questions.length - 1 ? (
          <ActionPill icon={ArrowLeft} onClick={() => onIndex(index + 1)} variant={question.latestAttempt ? "gold" : "quiet"}>
            {question.latestAttempt ? "לשאלה הבאה" : "דלג"}
          </ActionPill>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {canChallenge && (
              <ActionPill icon={challenging ? Loader2 : Flame} busy={challenging} onClick={onChallenge}>
                אתגר קשה יותר
              </ActionPill>
            )}
            <ActionPill icon={ArrowLeft} onClick={onContinue} variant="gold">
              {practice.flashcards.length ? "לכרטיסיות" : "לסיום החלק"}
            </ActionPill>
          </div>
        )}
      </div>
      {challengeError && <p className="text-xs text-accent-family">{challengeError}</p>}
    </div>
  );
}

function QuestionCard({ question, onAnswered }: { question: PracticeQuestionView; onAnswered: (q: PracticeQuestionView) => void }) {
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [gradingError, setGradingError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(!question.latestAttempt);
  const [showModel, setShowModel] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const kind = KIND_LABELS[question.kind];
  const KindIcon = kind.icon;
  const attempt = question.latestAttempt;

  async function submit() {
    const trimmed = answer.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setGradingError(null);
    try {
      const response = await fetch("/api/torah/practice/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question.id, answer: trimmed }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "השליחה נכשלה.");
      onAnswered(data.question);
      setGradingError(data.gradingError ?? null);
      setRetrying(false);
      setAnswer("");
    } catch (err) {
      setGradingError(err instanceof Error ? err.message : "השליחה נכשלה.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="flex items-center gap-1 rounded-full bg-gold-soft px-2.5 py-1 font-medium text-gold-ink">
          <KindIcon size={12} aria-hidden />
          {kind.label}
        </span>
        <span className="flex items-center gap-0.5" aria-label={`קושי ${question.difficulty} מתוך 5`}>
          {[1, 2, 3, 4, 5].map((d) => (
            <Circle key={d} size={7} className={d <= question.difficulty ? "fill-gold text-gold" : "text-gold-line"} aria-hidden />
          ))}
        </span>
      </div>
      <p className="text-lg font-medium leading-relaxed text-foreground">{question.prompt}</p>

      {attempt && !retrying ? (
        <GradedAttempt question={question} showModel={showModel} onToggleModel={() => setShowModel((s) => !s)} />
      ) : (
        <div className="flex flex-col gap-2">
          <textarea
            ref={textarea}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
            }}
            rows={5}
            placeholder="כתוב את תשובתך — נמק, הבא ראיה מהשיעור, והתייחס למקרה עצמו."
            aria-label="התשובה שלך"
            className="focus-ring resize-y rounded-2xl border border-hairline-card bg-surface px-4 py-3 text-[0.95rem] leading-7 text-foreground placeholder:text-muted"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[0.65rem] text-muted">
              ⌘/Ctrl + Enter לשליחה · עד <span className="ltr tabular-nums">+10</span> XP
            </span>
            <ActionPill icon={submitting ? Loader2 : Check} busy={submitting} variant="gold" onClick={() => void submit()} disabled={!answer.trim()}>
              {submitting ? "בודק את התשובה…" : "שלח לבדיקה"}
            </ActionPill>
          </div>
          <HavrutaHint questionId={question.id} draft={answer} />
        </div>
      )}

      {gradingError && <p className="text-xs text-accent-family">{gradingError}</p>}

      {attempt && !retrying && (
        <button
          type="button"
          onClick={() => {
            setRetrying(true);
            requestAnimationFrame(() => textarea.current?.focus());
          }}
          className="focus-ring w-fit text-xs text-muted hover:text-foreground"
        >
          לנסות לענות שוב
        </button>
      )}
    </article>
  );
}

function GradedAttempt({
  question,
  showModel,
  onToggleModel,
}: {
  question: PracticeQuestionView;
  showModel: boolean;
  onToggleModel: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const attempt = question.latestAttempt!;
  const score = attempt.score;
  const ring = 2 * Math.PI * 30;
  const tone = score === null ? "var(--muted)" : score >= 80 ? "var(--accent-health)" : score >= 55 ? "var(--gold)" : "var(--accent-family)";
  const verdict = score === null ? "נשמר" : score >= 85 ? "מצוין" : score >= 70 ? "טוב מאוד" : score >= 55 ? "בכיוון הנכון" : "כדאי לחזור על החלק";

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-hairline-card bg-surface-sunken/50 p-4">
      <div className="flex items-center gap-4">
        <div className="relative size-20 shrink-0">
          <svg viewBox="0 0 70 70" className="size-20 -rotate-90" aria-hidden>
            <circle cx="35" cy="35" r="30" fill="none" stroke="var(--fill)" strokeWidth="6" />
            <motion.circle
              cx="35"
              cy="35"
              r="30"
              fill="none"
              stroke={tone}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={ring}
              initial={{ strokeDashoffset: ring }}
              animate={{ strokeDashoffset: ring * (1 - (score ?? 0) / 100) }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.9, ease: "easeOut" }}
            />
          </svg>
          <span className="absolute inset-0 grid place-items-center text-xl font-bold text-foreground">
            {score === null ? "—" : <span className="ltr tabular-nums">{score}</span>}
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-base font-semibold text-foreground">{verdict}</p>
          {score !== null && (
            <p className="text-xs text-gold-ink">
              <span className="ltr tabular-nums">+{Math.max(XP.attemptMinimum, Math.round(score / 10))}</span> XP
            </p>
          )}
          <p className="mt-1 line-clamp-3 text-xs text-muted">״{attempt.answer}״</p>
        </div>
      </div>

      {attempt.feedback && <p className="text-sm leading-relaxed text-foreground/85">{attempt.feedback}</p>}

      {attempt.rubricResults.length > 0 && (
        <ul className="flex flex-col gap-2">
          {attempt.rubricResults.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm">
              {item.met ? (
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-accent-health" aria-label="התקיים" />
              ) : (
                <XCircle size={16} className="mt-0.5 shrink-0 text-accent-family/70" aria-label="חסר" />
              )}
              <span>
                <span className="text-foreground">{item.criterion}</span>
                {item.note && <span className="block text-xs text-muted">{item.note}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {question.modelAnswer && (
        <div>
          <button type="button" onClick={onToggleModel} className="focus-ring flex items-center gap-1 text-xs font-medium text-gold-ink" aria-expanded={showModel}>
            <ChevronDown size={13} className={cn("transition-transform", showModel && "rotate-180")} aria-hidden />
            תשובה מנומקת לדוגמה
          </button>
          {showModel && (
            <p className="mt-2 rounded-xl border-s-2 border-gold-line bg-surface px-3 py-2 text-sm leading-relaxed text-foreground/85">
              {question.modelAnswer}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function DonePhase({
  chunk,
  allDone,
  completing,
  completed,
  onComplete,
  onNext,
  onLesson,
}: {
  chunk: LearningChunkView;
  allDone: boolean;
  completing: boolean;
  completed: boolean;
  onComplete: () => void;
  onNext?: () => void;
  onLesson: () => void;
}) {
  if (!completed) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <Trophy size={28} className="text-gold" aria-hidden />
        <p className="text-base font-semibold text-foreground">סיום החלק ״{chunk.title}״</p>
        <ActionPill icon={completing ? Loader2 : Check} busy={completing} variant="gold" onClick={onComplete}>
          סמן את החלק כמתורגל
        </ActionPill>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-gradient-to-br from-gold to-gold-ink text-white shadow-lg">
        {allDone ? <PartyPopper size={28} aria-hidden /> : <Trophy size={26} aria-hidden />}
      </span>
      <p className="text-xl font-semibold text-foreground">{allDone ? "סיימת לתרגל את כל השיעור!" : "החלק תורגל"}</p>
      <p className="text-sm text-muted">
        <span className="ltr tabular-nums">+{XP.chunkCompleted}</span> XP · הכרטיסיות של החלק נכנסו לחזרה המרווחת
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {onNext && (
          <ActionPill icon={ArrowLeft} variant="gold" onClick={onNext}>
            לחלק הבא
          </ActionPill>
        )}
        <ActionPill icon={ArrowRight} onClick={onLesson}>
          חזרה לשיעור
        </ActionPill>
      </div>
    </div>
  );
}
