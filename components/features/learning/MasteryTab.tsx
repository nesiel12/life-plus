"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Brain, Check, ChevronLeft, ChevronRight, Layers, Loader2, Sparkles, X } from "lucide-react";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { Flashcard3D } from "@/components/features/learning/lab/Flashcard3D";
import { MagneticButton } from "@/components/features/learning/lab/MagneticButton";
import { useLab } from "@/components/features/learning/lab/LabContext";
import { useLabReducedMotion } from "@/components/features/learning/lab/useLabMotion";
import { useTopicMastery } from "@/components/features/learning/lab/useTopicMastery";
import { generateFlashcards, generateQuiz } from "@/lib/learning/labClient";
import { gradeQuiz, scoreLabel, type GeneratedQuestion } from "@/lib/learning/quiz";
import { MASTERY_LEVEL_LABELS } from "@/lib/learning/mastery";
import { dueCards } from "@/lib/torah/srs";
import type { LearningFlashcard } from "@/lib/learning/flashcards";
import type { LearningResource, LearningTopic } from "@/types";
import { cn } from "@/lib/utils";

interface MasteryTabProps {
  topics: readonly LearningTopic[];
  resources: readonly LearningResource[];
}

type Phase = "idle" | "loading" | "active" | "result";

/** מבחנים ושליטה — a topic's quiz generator, 3D flashcard deck, and mastery index. */
export function MasteryTab({ topics, resources }: MasteryTabProps) {
  const [topicId, setTopicId] = useState<string | null>(topics[0]?.id ?? null);
  const topic = topics.find((t) => t.id === topicId) ?? null;
  const topicResources = useMemo(() => resources.filter((r) => r.topicId === topicId), [resources, topicId]);
  const data = useTopicMastery(topicId, topicResources);

  if (topics.length === 0) {
    return <p className="rounded-2xl border border-dashed border-hairline-card p-8 text-center text-sm text-muted">הוסף נושא לימוד קודם — מבחנים וכרטיסיות נבנים סביב נושא קיים.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-muted" htmlFor="mastery-topic">
          נושא:
        </label>
        <select
          id="mastery-topic"
          value={topicId ?? ""}
          onChange={(e) => setTopicId(e.target.value)}
          className="focus-ring rounded-xl bg-fill-subtle px-3 py-2 text-sm text-foreground"
        >
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </div>

      {topic && (
        <>
          <MasteryHeader topicTitle={topic.title} loading={data.loading} score={data.mastery?.score ?? 0} result={data.mastery} />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <QuizSection topic={topic} resources={topicResources} onRecordAttempt={data.recordAttempt} />
            <FlashcardSection
              topic={topic}
              resources={topicResources}
              flashcards={data.flashcards ?? []}
              loading={data.loading}
              onAddDeck={data.addGeneratedDeck}
              onGrade={data.gradeCard}
              onRemove={data.removeCard}
            />
          </div>
          {data.error && <p className="text-xs text-accent-family">{data.error}</p>}
        </>
      )}
    </div>
  );
}

function MasteryHeader({
  topicTitle,
  loading,
  score,
  result,
}: {
  topicTitle: string;
  loading: boolean;
  score: number;
  result: ReturnType<typeof useTopicMastery>["mastery"];
}) {
  return (
    <div className="flex flex-wrap items-center gap-6 rounded-3xl border border-hairline-card bg-surface p-5">
      <ProgressRing value={score / 100} size={88} stroke={7} color="var(--accent-learning)" label={`ציון שליטה: ${score} מתוך 100`}>
        <span className="text-xl font-bold tabular-nums text-foreground">
          {loading ? "…" : <NumberTicker value={score} />}
        </span>
      </ProgressRing>
      <div className="min-w-0 flex-1">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Brain size={16} className="text-accent-learning" aria-hidden />
          ציון שליטה — {topicTitle}
        </h2>
        <p className="mt-1 text-sm text-muted">{result ? MASTERY_LEVEL_LABELS[result.tier] : "טוען…"}</p>
        {result && (
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
            <span>סילבוס: {Math.round(result.syllabusFraction * 100)}%</span>
            <span>{result.quizFraction !== null ? `מבחנים: ${Math.round(result.quizFraction * 100)}%` : "עדיין אין מבחנים"}</span>
            <span>{result.deckFraction !== null ? `כרטיסיות: ${Math.round(result.deckFraction * 100)}%` : "עדיין אין כרטיסיות"}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function QuizSection({
  topic,
  resources,
  onRecordAttempt,
}: {
  topic: LearningTopic;
  resources: readonly LearningResource[];
  onRecordAttempt: (score: number, total: number, questions: ReturnType<typeof gradeQuiz>["records"]) => Promise<void>;
}) {
  const lab = useLab();
  const reduce = useLabReducedMotion();
  const [phase, setPhase] = useState<Phase>("idle");
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [result, setResult] = useState<ReturnType<typeof gradeQuiz> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPhase("loading");
    setError(null);
    try {
      const quiz = await generateQuiz(topic.title, resources.map((r) => ({ title: r.title, notes: r.notes })));
      setQuestions(quiz.questions);
      setAnswers(Array(quiz.questions.length).fill(""));
      setIndex(0);
      setResult(null);
      setPhase("active");
    } catch {
      setError("לא הצלחנו לייצר מבחן כרגע. נסה שוב.");
      setPhase("idle");
    }
  }

  function setAnswer(value: string) {
    setAnswers((current) => current.map((a, i) => (i === index ? value : a)));
  }

  async function finish() {
    const graded = gradeQuiz(questions, answers);
    setResult(graded);
    setPhase("result");
    lab.audio.play(graded.fraction >= 0.6 ? "chime" : "shaky");
    if (graded.fraction >= 0.6) lab.celebrate("milestone", 0);
    await onRecordAttempt(graded.score, graded.total, graded.records).catch(() => undefined);
  }

  const current = questions[index];

  return (
    <section aria-label="מבחן AI" className="flex flex-col gap-3 rounded-3xl border border-hairline-card bg-surface p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">מבחן AI</h3>
        {phase !== "active" && (
          <MagneticButton
            onClick={() => void start()}
            disabled={phase === "loading"}
            className="flex items-center gap-1.5 rounded-xl bg-accent-learning/15 px-3 py-1.5 text-xs font-medium text-accent-learning transition-opacity disabled:opacity-50"
          >
            {phase === "loading" ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Sparkles size={12} aria-hidden />}
            {phase === "result" ? "מבחן חדש" : "בנה מבחן"}
          </MagneticButton>
        )}
      </div>

      {error && <p className="text-xs text-accent-family">{error}</p>}

      {phase === "active" && current && (
        <motion.div key={index} initial={reduce ? false : { opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-3">
          <p className="text-xs text-muted">
            שאלה {index + 1} מתוך {questions.length}
          </p>
          <p className="text-sm font-medium text-foreground">{current.prompt}</p>
          {current.kind === "mcq" ? (
            <div className="flex flex-col gap-1.5">
              {current.options?.map((opt) => (
                <button
                  key={opt}
                  onClick={() => setAnswer(opt)}
                  className={cn(
                    "focus-ring rounded-xl border px-3 py-2 text-start text-sm transition-colors",
                    answers[index] === opt ? "border-accent-learning bg-accent-learning/10 text-foreground" : "border-hairline-card text-foreground/90 hover:bg-fill-subtle"
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          ) : (
            <input
              value={answers[index] ?? ""}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="התשובה שלך…"
              aria-label="התשובה שלך"
              className="focus-ring rounded-xl bg-fill-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted"
            />
          )}
          <div className="flex items-center justify-between pt-1">
            <button onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0} className="focus-ring flex items-center gap-1 text-xs text-muted transition-opacity hover:text-foreground disabled:opacity-30">
              <ChevronRight size={13} aria-hidden />
              הקודם
            </button>
            {index === questions.length - 1 ? (
              <MagneticButton onClick={() => void finish()} className="rounded-xl bg-accent-learning px-4 py-1.5 text-xs font-semibold text-background">
                סיים מבחן
              </MagneticButton>
            ) : (
              <button onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))} className="focus-ring flex items-center gap-1 text-xs text-muted transition-colors hover:text-foreground">
                הבא
                <ChevronLeft size={13} aria-hidden />
              </button>
            )}
          </div>
        </motion.div>
      )}

      {phase === "result" && result && (
        <div className="flex flex-col gap-2">
          <p className="text-lg font-semibold text-foreground">{scoreLabel(result.score, result.total)} נכונות</p>
          <ul className="flex flex-col gap-1.5">
            {result.records.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                {r.correct ? <Check size={13} className="mt-0.5 shrink-0 text-accent-health" aria-hidden /> : <X size={13} className="mt-0.5 shrink-0 text-accent-family" aria-hidden />}
                <span className={cn("flex-1", !r.correct && "text-muted")}>
                  {r.prompt}
                  {!r.correct && <span className="block text-foreground/70">תשובה נכונה: {r.correctAnswer}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {phase === "idle" && !error && <p className="text-xs text-muted">מבחן קצר של 3-5 שאלות, נבנה מהמשאבים של הנושא.</p>}
    </section>
  );
}

function FlashcardSection({
  topic,
  resources,
  flashcards,
  loading,
  onAddDeck,
  onGrade,
  onRemove,
}: {
  topic: LearningTopic;
  resources: readonly LearningResource[];
  flashcards: readonly LearningFlashcard[];
  loading: boolean;
  onAddDeck: (cards: { front: string; back: string }[]) => Promise<unknown>;
  onGrade: ReturnType<typeof useTopicMastery>["gradeCard"];
  onRemove: ReturnType<typeof useTopicMastery>["removeCard"];
}) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [studying, setStudying] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [grading, setGrading] = useState(false);

  // Deliberately NOT memoized: "which cards are due" is a function of wall-clock
  // time as much as of `flashcards`, and useMemo only re-runs when its deps
  // change by reference. Cache this on [flashcards] and it freezes at whatever
  // it computed the first time that reference was set — including a false "0
  // due" if that first render landed in the sliver before a fresh card's
  // due_at (== its creation time) had actually elapsed. The list is at most a
  // few dozen cards, so recomputing on every render costs nothing.
  const queue = dueCards(flashcards.map((c) => ({ id: c.id, dueAt: c.state.dueAt, suspendedAt: undefined })));
  const queueCards = queue.map((q) => flashcards.find((c) => c.id === q.id)!).filter(Boolean);
  const activeCard = studying ? (queueCards[cursor] ?? null) : null;

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const deck = await generateFlashcards(topic.title, resources.map((r) => ({ title: r.title, notes: r.notes })));
      await onAddDeck(deck.cards);
    } catch {
      setError("לא הצלחנו לייצר כרטיסיות כרגע. נסה שוב.");
    } finally {
      setGenerating(false);
    }
  }

  async function answer(cardId: string, value: Parameters<typeof onGrade>[1]) {
    setGrading(true);
    try {
      await onGrade(cardId, value);
    } finally {
      setGrading(false);
      setCursor((c) => c + 1);
    }
  }

  return (
    <section aria-label="כרטיסיות זיכרון" className="flex flex-col gap-3 rounded-3xl border border-hairline-card bg-surface p-5">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Layers size={15} className="text-accent-learning" aria-hidden />
          כרטיסיות ({flashcards.length})
        </h3>
        <div className="flex items-center gap-2">
          <MagneticButton
            onClick={() => void generate()}
            disabled={generating}
            className="flex items-center gap-1.5 rounded-xl bg-accent-learning/15 px-3 py-1.5 text-xs font-medium text-accent-learning transition-opacity disabled:opacity-50"
          >
            {generating ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Sparkles size={12} aria-hidden />}
            {flashcards.length > 0 ? "הוסף עוד" : "בנה חפיסה"}
          </MagneticButton>
        </div>
      </div>

      {error && <p className="text-xs text-accent-family">{error}</p>}

      {loading ? (
        <p className="text-xs text-muted">טוען…</p>
      ) : flashcards.length === 0 ? (
        <p className="text-xs text-muted">עדיין אין כרטיסיות — AI יכול לבנות עבורך חפיסה מהמשאבים של הנושא.</p>
      ) : !studying ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-xs text-muted">{queueCards.length > 0 ? `${queueCards.length} כרטיסיות ממתינות לחזרה היום.` : "אין כרטיסיות שממתינות היום — אפשר לתרגל בכל זאת."}</p>
          <MagneticButton
            onClick={() => {
              setCursor(0);
              setStudying(true);
            }}
            className="rounded-xl bg-accent-learning px-4 py-2 text-sm font-semibold text-background"
          >
            התחל תרגול
          </MagneticButton>
        </div>
      ) : activeCard ? (
        <div className="flex flex-col items-center gap-3 py-2">
          <p className="text-xs text-muted">
            {cursor + 1} מתוך {queueCards.length}
          </p>
          <Flashcard3D card={activeCard} onAnswer={(a) => void answer(activeCard.id, a)} grading={grading} />
          <button onClick={() => setStudying(false)} className="focus-ring text-xs text-muted hover:text-foreground">
            עצור תרגול
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <Check size={22} className="text-accent-health" aria-hidden />
          <p className="text-sm text-foreground">סיימת את כל הכרטיסיות להיום 🎉</p>
          <button onClick={() => setStudying(false)} className="focus-ring text-xs text-muted hover:text-foreground">
            חזרה
          </button>
        </div>
      )}

      {!studying && flashcards.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 border-t border-hairline-card pt-2">
          {flashcards.slice(0, 5).map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 text-xs text-muted">
              <span className="truncate">{c.front}</span>
              <button onClick={() => void onRemove(c.id)} aria-label="מחק כרטיסייה" className="shrink-0 hover:text-accent-family">
                <X size={11} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
