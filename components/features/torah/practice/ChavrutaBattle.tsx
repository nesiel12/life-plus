"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import confetti from "canvas-confetti";
import { ArrowRight, Flame, Layers, Loader2, RotateCcw, Scale, Swords, Trophy, Zap } from "lucide-react";
import { ComboHud } from "@/components/features/torah/practice/ComboHud";
import { FlipCard, type SwipeVerdict } from "@/components/features/torah/practice/FlipCard";
import { QuestionRound } from "@/components/features/torah/practice/QuestionRound";
import { XpBursts, type Burst } from "@/components/features/torah/practice/XpBurst";
import { SectionPlaceholder } from "@/components/features/torah/hub/PageSection";
import { nextDifficulty, pickQuestion } from "@/lib/torah/adaptive";
import {
  applyRound,
  initialCombo,
  multiplierFor,
  outcomeForAnswer,
  outcomeForScore,
  type ComboState,
  type RoundOutcome,
} from "@/lib/torah/combo";
import { XP, nextReviewLabel } from "@/lib/torah/practiceStats";
import { reviewAnswer, type SrsAnswer } from "@/lib/torah/srs";
import { playCue, readMuted, writeMuted } from "@/lib/sound/cues";
import type { FlashcardView, PracticeQuestionView } from "@/lib/torah/lessons/types";
import { cn } from "@/lib/utils";

type BattleQuestion = PracticeQuestionView & { lessonTitle: string | null };

interface Deck {
  cards: FlashcardView[];
  questions: BattleQuestion[];
  startingDifficulty: number;
  lessonTitles: Record<string, string>;
}

type Round = { type: "card"; card: FlashcardView } | { type: "question"; question: BattleQuestion };

/** A written round after every this-many cards, while questions remain. */
const CARDS_PER_QUESTION = 3;

const ANSWERS: { answer: SrsAnswer; label: string; key: string; tone: string }[] = [
  { answer: "again", label: "שוב", key: "1", tone: "border-accent-family/30 text-accent-family hover:bg-accent-family/8" },
  { answer: "hard", label: "קשה", key: "2", tone: "border-accent-fitness/30 text-accent-fitness hover:bg-accent-fitness/8" },
  { answer: "good", label: "טוב", key: "3", tone: "border-accent-knowledge/30 text-accent-knowledge hover:bg-accent-knowledge/8" },
  { answer: "easy", label: "קל", key: "4", tone: "border-accent-health/30 text-accent-health hover:bg-accent-health/8" },
];

/**
 * "קרב חברותא" — a gamified practice session over everything due.
 *
 * Flashcards (flip, then swipe or grade 1–4) are interleaved with written
 * dilemmas and counter-arguments, whose difficulty climbs or eases after each
 * graded answer (lib/torah/adaptive.ts). Every clean answer builds a 🔥 streak
 * whose multiplier boosts the XP it earns (lib/torah/combo.ts); tiers are
 * announced with a banner and a rising chime.
 *
 * Every round is a real review or attempt, saved as it happens through the
 * same routes the rest of "לתרגל" uses — the session record at the end only
 * adds the combo bonus that the ORDER of answers earned.
 */
export function ChavrutaBattle() {
  const reduceMotion = useReducedMotion();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"intro" | "playing" | "done">("intro");

  const [cardQueue, setCardQueue] = useState<FlashcardView[]>([]);
  const [answered, setAnswered] = useState<Set<string>>(new Set());
  const [round, setRound] = useState<Round | null>(null);
  const [sinceQuestion, setSinceQuestion] = useState(0);
  const [difficulty, setDifficulty] = useState(2);
  const [requeued, setRequeued] = useState<Set<string>>(new Set());

  const [combo, setCombo] = useState<ComboState>(initialCombo);
  const [flipped, setFlipped] = useState(false);
  const [grading, setGrading] = useState(false);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [banner, setBanner] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [roundError, setRoundError] = useState<string | null>(null);
  const [questionDone, setQuestionDone] = useState(false);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "failed">("idle");

  const startedAt = useRef<string>(new Date().toISOString());
  const shownAt = useRef(Date.now());
  const burstId = useRef(0);
  const totalRounds = useRef(0);

  useEffect(() => setMuted(readMuted()), []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const response = await fetch("/api/torah/practice/battle", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setDeck(data as Deck);
    } catch {
      setLoadError("טעינת הקרב נכשלה. נסה לרענן.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cue = useCallback(
    (event: Parameters<typeof playCue>[0], streak = 0) => {
      if (!muted) playCue(event, streak);
    },
    [muted]
  );

  /** Chooses the next round: a question every few cards, adapted to the current level. */
  const advance = useCallback(
    (queue: FlashcardView[], done: Set<string>, since: number, target: number) => {
      const questions = deck?.questions ?? [];
      const question = pickQuestion(questions, done, target);
      const wantQuestion = question && (since >= CARDS_PER_QUESTION || queue.length === 0);
      if (wantQuestion) {
        setRound({ type: "question", question });
        setSinceQuestion(0);
      } else if (queue.length > 0) {
        setRound({ type: "card", card: queue[0] });
        setSinceQuestion(since);
      } else {
        setRound(null);
        setPhase("done");
        return;
      }
      setFlipped(false);
      setQuestionDone(false);
      setRoundError(null);
      shownAt.current = Date.now();
    },
    [deck]
  );

  function start() {
    if (!deck) return;
    startedAt.current = new Date().toISOString();
    totalRounds.current = deck.cards.length + deck.questions.length;
    setCombo(initialCombo());
    setAnswered(new Set());
    setRequeued(new Set());
    setDifficulty(deck.startingDifficulty);
    setCardQueue(deck.cards);
    setSaved("idle");
    setPhase("playing");
    advance(deck.cards, new Set(), 0, deck.startingDifficulty);
  }

  /** Scores a round: combo, XP burst, sound, banner. */
  const score = useCallback(
    (outcome: RoundOutcome, baseXp: number) => {
      const step = applyRound(combo, outcome, baseXp);
      setCombo(step.state);
      const id = ++burstId.current;
      if (step.gained > 0) setBursts((prev) => [...prev, { id, amount: step.gained, boosted: step.multiplier > 1 }]);
      if (step.tierUp) {
        cue("tier-up", step.state.streak);
        setBanner(`קומבו ×${multiplierFor(step.state.streak)}!`);
        window.setTimeout(() => setBanner(null), 1400);
      } else if (outcome === "clean") cue("correct", step.state.streak);
      else if (outcome === "shaky") cue("shaky");
      else {
        cue("miss");
        if (step.broke) {
          setBanner("הרצף נשבר — ממשיכים");
          window.setTimeout(() => setBanner(null), 1200);
        }
      }
    },
    [combo, cue]
  );

  const gradeCard = useCallback(
    async (answer: SrsAnswer) => {
      if (round?.type !== "card" || !flipped || grading) return;
      const card = round.card;
      setGrading(true);
      setRoundError(null);
      try {
        const response = await fetch(`/api/torah/flashcards/${card.id}/grade`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answer, durationMs: Date.now() - shownAt.current }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        const outcome = outcomeForAnswer(answer);
        score(outcome, outcome === "miss" ? XP.reviewForgotten : XP.reviewRecalled);

        // A forgotten card comes back once at the end of the battle — the
        // cheapest moment to fix forgetting is right after it happens.
        let rest = cardQueue.slice(1);
        if (outcome === "miss" && !requeued.has(card.id)) {
          rest = [...rest, data.card as FlashcardView];
          setRequeued((prev) => new Set(prev).add(card.id));
          totalRounds.current += 1;
        }
        setCardQueue(rest);
        advance(rest, answered, sinceQuestion + 1, difficulty);
      } catch {
        setRoundError("הדירוג לא נשמר. נסה שוב.");
      } finally {
        setGrading(false);
      }
    },
    [round, flipped, grading, cardQueue, requeued, answered, sinceQuestion, difficulty, advance, score]
  );

  function onQuestionGraded(value: number | null) {
    if (round?.type !== "question") return;
    const outcome = outcomeForScore(value);
    score(outcome, Math.max(XP.attemptMinimum, Math.round((value ?? 0) / 10)));
    setDifficulty((d) => nextDifficulty(d, value));
    setAnswered((prev) => new Set(prev).add(round.question.id));
    setQuestionDone(true);
  }

  function continueAfterQuestion() {
    if (round?.type !== "question") return;
    const done = new Set(answered).add(round.question.id);
    advance(cardQueue, done, 0, difficulty);
  }

  // Keyboard: Space flips, 1–4 grade, arrows swipe.
  useEffect(() => {
    if (phase !== "playing" || round?.type !== "card") return;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        setFlipped((f) => !f);
        return;
      }
      if (event.key === "ArrowRight" && flipped) void gradeCard("good");
      if (event.key === "ArrowLeft" && flipped) void gradeCard("again");
      const match = ANSWERS.find((a) => a.key === event.key);
      if (match) void gradeCard(match.answer);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, round, flipped, gradeCard]);

  // The finish: celebrate honestly, then record the session once.
  useEffect(() => {
    if (phase !== "done" || saved !== "idle") return;
    cue("finish");
    const accuracy = combo.rounds > 0 ? combo.correct / combo.rounds : 0;
    if (accuracy >= 0.7 && !reduceMotion) {
      void confetti({ particleCount: 90, spread: 70, origin: { y: 0.65 }, colors: ["#b89355", "#f59e0b", "#f97316", "#ffffff"] });
    }
    if (combo.rounds === 0) {
      setSaved("saved");
      return;
    }
    setSaved("saving");
    fetch("/api/torah/practice/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startedAt: startedAt.current,
        rounds: combo.rounds,
        correct: combo.correct,
        maxCombo: Math.min(combo.best, combo.correct),
        bonusXp: combo.bonusXp,
      }),
    })
      .then((r) => setSaved(r.ok ? "saved" : "failed"))
      .catch(() => setSaved("failed"));
  }, [phase, saved, combo, cue, reduceMotion]);

  const previews = useMemo(() => {
    if (round?.type !== "card") return null;
    const card = round.card;
    const now = new Date();
    const state = {
      easeFactor: card.easeFactor,
      intervalDays: card.intervalDays,
      repetitions: card.repetitions,
      lapses: card.lapses,
      dueAt: new Date(card.dueAt),
    };
    return Object.fromEntries(ANSWERS.map(({ answer }) => [answer, nextReviewLabel(now, reviewAnswer(state, answer, now).dueAt)]));
  }, [round]);

  const xpTotal = combo.baseXp + combo.bonusXp;

  if (loadError) {
    return (
      <SectionPlaceholder icon={Swords} title="הקרב לא נטען" body={loadError}>
        <button type="button" onClick={() => void load()} className="focus-ring rounded-full bg-gold px-4 py-1.5 text-xs font-medium text-white">
          נסה שוב
        </button>
      </SectionPlaceholder>
    );
  }

  if (!deck) {
    return (
      <p className="flex items-center justify-center gap-2 py-24 text-sm text-muted" role="status">
        <Loader2 size={16} className="animate-spin" aria-hidden />
        מכין את הקרב…
      </p>
    );
  }

  if (phase === "intro") {
    const empty = deck.cards.length + deck.questions.length === 0;
    const dilemmas = deck.questions.filter((q) => q.kind === "dilemma" || q.kind === "counter").length;
    return (
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative mx-auto flex max-w-xl flex-col items-center gap-5 overflow-hidden rounded-3xl border border-gold-line bg-gradient-to-b from-gold-soft/80 to-surface p-8 text-center shadow-[0_40px_80px_-50px_rgba(135,102,40,0.7)]"
      >
        <motion.span
          animate={reduceMotion ? undefined : { rotate: [0, -6, 6, 0] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
          className="grid size-16 place-items-center rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-[0_12px_30px_-10px_rgba(245,158,11,0.9)]"
          aria-hidden
        >
          <Swords size={30} />
        </motion.span>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">קרב חברותא</h2>
          <p className="mt-1 text-sm text-muted">כרטיסיות, דילמות וקושיות — כל תשובה נכונה מלבה את הרצף.</p>
        </div>
        {empty ? (
          <p className="rounded-2xl bg-surface/80 px-4 py-3 text-sm text-foreground/80">
            אין כרגע כרטיסיות לחזרה או שאלות פתוחות. תרגל חלק חדש מאחד השיעורים — והקרב הבא יחכה לך כאן.
          </p>
        ) : (
          <>
            <div className="grid w-full grid-cols-3 gap-2">
              {[
                { icon: Layers, value: deck.cards.length, label: "כרטיסיות" },
                { icon: Scale, value: dilemmas, label: "דילמות וקושיות" },
                { icon: Zap, value: deck.questions.length - dilemmas, label: "שאלות יישום" },
              ].map(({ icon: Icon, value, label }) => (
                <div key={label} className="rounded-2xl bg-surface/80 px-2 py-3">
                  <Icon size={16} className="mx-auto text-gold-ink" aria-hidden />
                  <p className="ltr mt-1 text-xl font-bold tabular-nums text-foreground">{value}</p>
                  <p className="text-[0.65rem] text-muted">{label}</p>
                </div>
              ))}
            </div>
            <ul className="w-full space-y-1 text-start text-xs text-foreground/75">
              <li className="flex items-center gap-2">
                <Flame size={13} className="text-orange-500" aria-hidden />3 ברצף — ×1.5 · 5 ברצף — ×2 · 8 ברצף — ×3
              </li>
              <li className="flex items-center gap-2">
                <Zap size={13} className="text-gold-ink" aria-hidden />
                הקושי מתאים את עצמו לתשובות שלך
              </li>
            </ul>
            <motion.button
              type="button"
              onClick={start}
              whileHover={reduceMotion ? undefined : { scale: 1.03 }}
              whileTap={reduceMotion ? undefined : { scale: 0.97 }}
              className="focus-ring inline-flex items-center gap-2 rounded-full bg-gradient-to-l from-amber-400 to-orange-500 px-7 py-3 text-base font-bold text-white shadow-[0_14px_34px_-12px_rgba(245,158,11,0.9)]"
            >
              <Swords size={18} aria-hidden />
              לקרב
            </motion.button>
          </>
        )}
      </motion.div>
    );
  }

  if (phase === "done") {
    const accuracy = combo.rounds > 0 ? Math.round((combo.correct / combo.rounds) * 100) : 0;
    return (
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="mx-auto flex max-w-xl flex-col items-center gap-5 rounded-3xl border border-gold-line bg-gradient-to-b from-gold-soft/70 to-surface p-8 text-center"
      >
        <span className="grid size-16 place-items-center rounded-3xl bg-gold text-white shadow-lg" aria-hidden>
          <Trophy size={30} />
        </span>
        <div>
          <h2 className="text-2xl font-bold text-foreground">{accuracy >= 70 ? "קרב מצוין!" : "סיימת את הקרב"}</h2>
          <p className="text-sm text-muted">{combo.rounds} סבבים · {accuracy}% הצלחה</p>
        </div>
        <div className="grid w-full grid-cols-3 gap-2">
          <Stat label="XP בקרב" value={`+${xpTotal}`} />
          <Stat label="בונוס קומבו" value={`+${combo.bonusXp}`} highlight={combo.bonusXp > 0} />
          <Stat label="הרצף הארוך" value={`🔥 ${combo.best}`} />
        </div>
        <p className="text-xs text-muted">
          {saved === "saving" ? "שומר…" : saved === "failed" ? "הבונוס לא נשמר, אבל כל התשובות נשמרו." : "הכל נשמר."}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              setDeck(null);
              setPhase("intro");
              void load();
            }}
            className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-gold px-4 py-2 text-sm font-medium text-white"
          >
            <RotateCcw size={14} aria-hidden />
            קרב נוסף
          </button>
          <Link href="/areas/torah/practice" className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-hairline-card bg-surface px-4 py-2 text-sm text-foreground/85">
            <ArrowRight size={14} aria-hidden />
            לתרגול
          </Link>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <ComboHud
        streak={combo.streak}
        xp={xpTotal}
        round={combo.rounds + 1}
        total={Math.max(totalRounds.current, combo.rounds + 1)}
        muted={muted}
        onToggleMute={() => {
          setMuted((m) => {
            writeMuted(!m);
            return !m;
          });
        }}
      />

      <div className="relative">
        <XpBursts bursts={bursts} onDone={(id) => setBursts((prev) => prev.filter((b) => b.id !== id))} />
        <AnimatePresence>
          {banner && (
            <motion.p
              initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12 }}
              className="pointer-events-none absolute inset-x-0 -top-2 z-30 mx-auto w-fit rounded-full bg-gradient-to-l from-amber-400 to-orange-500 px-4 py-1.5 text-sm font-bold text-white shadow-[0_10px_30px_-8px_rgba(245,158,11,0.9)]"
              role="status"
            >
              {banner}
            </motion.p>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait" initial={false}>
          {round?.type === "card" && (
            <motion.div
              key={`card-${round.card.id}-${combo.rounds}`}
              initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -16, scale: 0.97 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col gap-4"
            >
              <FlipCard
                front={round.card.front}
                back={round.card.back}
                label={round.card.lessonId ? deck.lessonTitles[round.card.lessonId] : undefined}
                flipped={flipped}
                onFlip={() => setFlipped((f) => !f)}
                onSwipe={(verdict: SwipeVerdict) => void gradeCard(verdict === "known" ? "good" : "again")}
                disabled={grading}
              />
              <div className={cn("grid grid-cols-4 gap-2 transition-opacity", flipped ? "opacity-100" : "pointer-events-none opacity-40")}>
                {ANSWERS.map(({ answer, label, key, tone }) => (
                  <button
                    key={answer}
                    type="button"
                    disabled={!flipped || grading}
                    onClick={() => void gradeCard(answer)}
                    className={cn("focus-ring flex flex-col items-center gap-0.5 rounded-2xl border bg-surface px-2 py-2.5 transition-colors", tone)}
                  >
                    <span className="text-sm font-semibold">{label}</span>
                    <span className="text-[0.65rem] opacity-80">{previews?.[answer]}</span>
                    <span className="ltr hidden text-[0.55rem] text-muted sm:block">{key}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {round?.type === "question" && (
            <motion.div
              key={`q-${round.question.id}`}
              initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -16, scale: 0.97 }}
              transition={{ duration: 0.25 }}
            >
              <QuestionRound question={round.question} onGraded={onQuestionGraded} onContinue={continueAfterQuestion} />
              {!questionDone && (
                <button
                  type="button"
                  onClick={() => {
                    setAnswered((prev) => new Set(prev).add(round.question.id));
                    advance(cardQueue, new Set(answered).add(round.question.id), 0, difficulty);
                  }}
                  className="focus-ring mt-2 text-xs text-muted hover:text-foreground"
                >
                  דלג על השאלה
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {roundError && <p className="text-xs text-accent-family">{roundError}</p>}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-2xl px-2 py-3", highlight ? "bg-gradient-to-b from-amber-100 to-orange-50 dark:from-amber-500/15 dark:to-orange-500/5" : "bg-surface/80")}>
      <p className="ltr text-xl font-bold tabular-nums text-foreground">{value}</p>
      <p className="text-[0.65rem] text-muted">{label}</p>
    </div>
  );
}
