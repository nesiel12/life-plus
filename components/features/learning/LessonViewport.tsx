"use client";

import { Component, useCallback, useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Lightbulb, Mic, PartyPopper, PlayCircle, RotateCcw, Sparkles } from "lucide-react";
import { LessonViewportSkeleton } from "@/components/features/learning/LessonViewportSkeleton";
import { LessonContentRenderer } from "@/components/features/learning/LessonContentRenderer";
import { InAppVideoPlayer } from "@/components/features/learning/InAppVideoPlayer";
import { InterviewAudioVault } from "@/components/features/learning/InterviewAudioVault";
import { PioneerProfileDrawer } from "@/components/features/learning/PioneerProfileDrawer";
import { TopicBloopersBox } from "@/components/features/learning/TopicBloopersBox";
import { useLab, originOf, type Point } from "@/components/features/learning/lab/LabContext";
import { useResourceCompletion } from "@/components/features/learning/lab/useResourceCompletion";
import { getCheckpointAnswersAction, submitCheckpointAnswerAction, type CheckpointAnswerState } from "@/app/actions/masterclassProgress";
import { CHECKPOINT_XP, checkpointCelebrationFor } from "@/lib/learning/masterclassXp";
import type { LessonGenerateResponse } from "@/app/api/learning/lesson/generate/route";
import { TEACHING_MODES, USER_AGE_GROUPS, type InlineCheckpoint, type LessonBlockContent, type TeachingMode, type UserAgeGroup } from "@/types/learning";
import type { LearningResource, LearningTopic } from "@/types";
import { cn } from "@/lib/utils";

const GENERIC_ERROR = "משהו השתבש ביצירת השיעור — נסה שוב";

const AGE_GROUP_LABEL: Record<UserAgeGroup, string> = {
  KIDS_8_12: "ילדים (8-12)",
  TEENS_13_18: "נוער (13-18)",
  ADULTS_19_PLUS: "מבוגרים (19+)",
};
const TEACHING_MODE_LABEL: Record<TeachingMode, string> = {
  STORYTELLING: "סיפורי",
  PRACTICAL: "מעשי",
  ANALOGIES: "אנלוגיות",
  SOCRATIC: "סוקרטי",
};

const AGE_GROUP_KEY = "lifeplus.masterclass.ageGroup";
const TEACHING_MODE_KEY = "lifeplus.masterclass.teachingMode";

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return (allowed as readonly string[]).includes(raw ?? "") ? (raw as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore — the picker still works for this session, just not remembered
  }
}

// --- Error boundary ----------------------------------------------------
//
// A real class component, not a hook: React only lets a render-time crash
// (a bad field shape reaching a renderer this Phase 1 shell didn't
// anticipate, say) be caught by componentDidCatch/getDerivedStateFromError
// — no functional-component equivalent exists. This is a second, distinct
// failure class from a failed /api/learning/lesson/generate call (handled
// below as ordinary state): that one never reaches render with bad data in
// the first place, this one is a defense against a render itself throwing.
// Both converge on the same friendly retry message.

interface ErrorBoundaryProps {
  children: ReactNode;
  onRetry: () => void;
}
interface ErrorBoundaryState {
  crashed: boolean;
}

class LessonErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { crashed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { crashed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[LessonViewport] render crashed:", error);
  }

  render() {
    if (this.state.crashed) {
      return (
        <LessonErrorState
          onRetry={() => {
            this.setState({ crashed: false });
            this.props.onRetry();
          }}
        />
      );
    }
    return this.props.children;
  }
}

function LessonErrorState({ onRetry, message }: { onRetry: () => void; message?: string }) {
  return (
    <div dir="rtl" className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-hairline-card p-10 text-center">
      <AlertTriangle size={28} className="text-accent-family" aria-hidden />
      <p className="text-sm text-foreground">{message || GENERIC_ERROR}</p>
      <button
        onClick={onRetry}
        className="focus-ring flex items-center gap-1.5 rounded-xl bg-accent-learning/15 px-4 py-2 text-sm font-medium text-accent-learning transition-opacity hover:opacity-80"
      >
        <RotateCcw size={14} aria-hidden />
        נסה שוב
      </button>
    </div>
  );
}

// --- Age group / teaching mode picker ---------------------------------

function SegmentedPicker<T extends string>({ value, options, labels, onChange }: { value: T; options: readonly T[]; labels: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option}
          role="radio"
          aria-checked={value === option}
          onClick={() => onChange(option)}
          className={cn(
            "focus-ring rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
            value === option ? "bg-accent-learning text-background" : "bg-fill-subtle text-muted hover:text-foreground"
          )}
        >
          {labels[option]}
        </button>
      ))}
    </div>
  );
}

function LessonSettingsBar({
  ageGroup,
  teachingMode,
  onChangeAgeGroup,
  onChangeTeachingMode,
}: {
  ageGroup: UserAgeGroup;
  teachingMode: TeachingMode;
  onChangeAgeGroup: (v: UserAgeGroup) => void;
  onChangeTeachingMode: (v: TeachingMode) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-hairline-card bg-fill-subtle/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium text-muted">קהל יעד:</span>
        <SegmentedPicker value={ageGroup} options={USER_AGE_GROUPS} labels={AGE_GROUP_LABEL} onChange={onChangeAgeGroup} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium text-muted">סגנון הוראה:</span>
        <SegmentedPicker value={teachingMode} options={TEACHING_MODES} labels={TEACHING_MODE_LABEL} onChange={onChangeTeachingMode} />
      </div>
    </div>
  );
}

// --- Viewport ------------------------------------------------------------

export interface LessonViewportProps {
  topic: LearningTopic;
  resource: LearningResource;
  customEmphasis?: string;
}

type LoadState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; content: LessonBlockContent; cached: boolean };

export function LessonViewport({ topic, resource, customEmphasis }: LessonViewportProps) {
  const topicId = topic.id;
  const stepId = resource.id;

  // Lazy initializers, not a post-mount effect: reading localStorage here
  // means the very first render already has the person's remembered
  // picker choice, so `load` below never fires with the wrong (default)
  // params and then immediately fires again once an effect corrects them.
  // That double-fire was a real, confirmed bug for any returning user who
  // had ever changed a picker — two concurrent /api/learning/lesson/generate
  // calls per open, each independently charging AI quota and racing on the
  // cache insert (the unique-violation fallback added earlier papered over
  // the race's failure mode without addressing why two requests fired at
  // all). readStored's own try/catch already makes it safe to call during
  // SSR, where localStorage doesn't exist.
  const [ageGroup, setAgeGroup] = useState<UserAgeGroup>(() => readStored(AGE_GROUP_KEY, USER_AGE_GROUPS, "ADULTS_19_PLUS"));
  const [teachingMode, setTeachingMode] = useState<TeachingMode>(() => readStored(TEACHING_MODE_KEY, TEACHING_MODES, "STORYTELLING"));

  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [retryToken, setRetryToken] = useState(0);
  const [answers, setAnswers] = useState<Record<string, CheckpointAnswerState>>({});

  const lab = useLab();
  const complete = useResourceCompletion();

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/learning/lesson/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId, stepId, userAgeGroup: ageGroup, teachingMode, customEmphasis }),
      });
      const body = (await res.json().catch(() => null)) as (LessonGenerateResponse & { error?: string }) | null;
      if (!res.ok || !body || !body.content) {
        setState({ kind: "error", message: body?.error || GENERIC_ERROR });
        return;
      }
      setState({ kind: "ready", content: body.content, cached: body.cached });
    } catch {
      setState({ kind: "error", message: GENERIC_ERROR });
    }
  }, [topicId, stepId, ageGroup, teachingMode, customEmphasis]);

  useEffect(() => {
    void load();
    // retryToken intentionally re-triggers the same fetch on retry without
    // changing any of the actual request parameters above.
  }, [load, retryToken]);

  // Prior checkpoint answers for this exact generated variant, fetched once
  // the content itself has loaded — pre-fills each CheckpointCard so
  // reopening a lesson shows what was last answered instead of resetting.
  useEffect(() => {
    if (state.kind !== "ready") return;
    let cancelled = false;
    void getCheckpointAnswersAction(topicId, stepId, ageGroup, teachingMode).then((rows) => {
      if (cancelled) return;
      setAnswers(Object.fromEntries(rows.map((row) => [row.checkpointId, row])));
    });
    return () => {
      cancelled = true;
    };
  }, [state.kind, topicId, stepId, ageGroup, teachingMode]);

  const retry = useCallback(() => setRetryToken((t) => t + 1), []);

  const changeAgeGroup = useCallback((v: UserAgeGroup) => {
    setAgeGroup(v);
    writeStored(AGE_GROUP_KEY, v);
  }, []);
  const changeTeachingMode = useCallback((v: TeachingMode) => {
    setTeachingMode(v);
    writeStored(TEACHING_MODE_KEY, v);
  }, []);

  const handleCheckpointAnswered = useCallback(
    (checkpoint: InlineCheckpoint, selectedIndex: number, origin: Point | undefined) => {
      const isCorrect = selectedIndex === checkpoint.correctIndex;
      const wasCorrectBefore = answers[checkpoint.id]?.isCorrect ?? false;

      setAnswers((current) => ({
        ...current,
        [checkpoint.id]: { checkpointId: checkpoint.id, selectedIndex, isCorrect, attempts: (current[checkpoint.id]?.attempts ?? 0) + 1 },
      }));

      if (checkpointCelebrationFor({ wasCorrectBefore, isCorrectNow: isCorrect }) === "correct") {
        lab.celebrate("milestone", CHECKPOINT_XP, origin);
        lab.audio.play("chime");
      }

      void submitCheckpointAnswerAction(topicId, stepId, checkpoint.id, ageGroup, teachingMode, selectedIndex, isCorrect).catch(() => {
        // Best-effort persistence: the local answer state above already
        // reflects the attempt, so a failed write here loses only the
        // cross-session memory of it, not the immediate feedback.
      });
    },
    [answers, lab, topicId, stepId, ageGroup, teachingMode]
  );

  const finishLesson = useCallback(
    async (e: MouseEvent<HTMLButtonElement>) => {
      await complete(resource, true, originOf(e.currentTarget));
    },
    [complete, resource]
  );

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <LessonSettingsBar ageGroup={ageGroup} teachingMode={teachingMode} onChangeAgeGroup={changeAgeGroup} onChangeTeachingMode={changeTeachingMode} />

      {state.kind === "loading" && <LessonViewportSkeleton />}
      {state.kind === "error" && <LessonErrorState onRetry={retry} message={state.message} />}
      {state.kind === "ready" && (
        <LessonErrorBoundary onRetry={retry}>
          <div className="flex flex-col gap-6">
            <LessonContent
              content={state.content}
              answers={answers}
              onCheckpointAnswered={handleCheckpointAnswered}
              topicId={topicId}
              stepId={stepId}
              userAgeGroup={ageGroup}
              teachingMode={teachingMode}
            />
            {!resource.isCompleted && (
              <button
                onClick={(e) => void finishLesson(e)}
                className="focus-ring flex items-center justify-center gap-2 self-center rounded-2xl bg-accent-learning px-6 py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90"
              >
                <PartyPopper size={16} aria-hidden />
                סיימתי את השיעור
              </button>
            )}
            {resource.isCompleted && (
              <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-accent-learning">
                <CheckCircle2 size={16} aria-hidden />
                השיעור הזה כבר סומן כהושלם
              </p>
            )}
          </div>
        </LessonErrorBoundary>
      )}
    </div>
  );
}

// --- Content sections ------------------------------------------------------

function LessonContent({
  content,
  answers,
  onCheckpointAnswered,
  topicId,
  stepId,
  userAgeGroup,
  teachingMode,
}: {
  content: LessonBlockContent;
  answers: Record<string, CheckpointAnswerState>;
  onCheckpointAnswered: (checkpoint: InlineCheckpoint, selectedIndex: number, origin: Point | undefined) => void;
  topicId: string;
  stepId: string;
  userAgeGroup: UserAgeGroup;
  teachingMode: TeachingMode;
}) {
  const hasAudio = (content.inAppMedia.audioSnippets?.length ?? 0) > 0;
  return (
    <div className="flex flex-col gap-6">
      <OriginStorySection originStory={content.originStory} />
      {content.pioneers.length > 0 && (
        <PioneersSection pioneers={content.pioneers} topicId={topicId} stepId={stepId} userAgeGroup={userAgeGroup} teachingMode={teachingMode} />
      )}
      <CoreContentSection coreContent={content.coreContent} />
      {content.blooperOrDisaster && <TopicBloopersBox text={content.blooperOrDisaster} />}
      {content.mindBlowingTrivia.length > 0 && <TriviaSection items={content.mindBlowingTrivia} />}
      {content.memeData.jokeText && <MemeSection meme={content.memeData} />}
      {content.inAppMedia.youtubeVideoId && (
        <SectionCard title="לצפייה" icon={<PlayCircle size={15} className="text-accent-learning" aria-hidden />}>
          <InAppVideoPlayer videoId={content.inAppMedia.youtubeVideoId} title="סרטון השיעור" chapters={content.inAppMedia.videoChapters} />
        </SectionCard>
      )}
      {hasAudio && (
        <SectionCard title="קטעי שמע" icon={<Mic size={15} className="text-accent-learning" aria-hidden />}>
          <InterviewAudioVault snippets={content.inAppMedia.audioSnippets ?? []} />
        </SectionCard>
      )}
      {content.inlineCheckpoints.length > 0 && <CheckpointsSection checkpoints={content.inlineCheckpoints} answers={answers} onAnswered={onCheckpointAnswered} />}
    </div>
  );
}

function SectionCard({ title, icon, children, className }: { title?: string; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-3xl border border-hairline-card bg-surface p-6 transition-colors hover:border-accent-learning/30", className)}>
      {title && (
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          {icon}
          {title}
        </h3>
      )}
      {children}
    </section>
  );
}

function OriginStorySection({ originStory }: { originStory: string }) {
  return (
    <SectionCard title="איך זה התחיל" icon={<Sparkles size={15} className="text-accent-learning" aria-hidden />} className="bg-gradient-to-bl from-accent-learning/10 via-surface to-surface">
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{originStory}</p>
    </SectionCard>
  );
}

function PioneersSection({
  pioneers,
  topicId,
  stepId,
  userAgeGroup,
  teachingMode,
}: {
  pioneers: LessonBlockContent["pioneers"];
  topicId: string;
  stepId: string;
  userAgeGroup: UserAgeGroup;
  teachingMode: TeachingMode;
}) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-foreground">האנשים מאחורי הרעיון</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {pioneers.map((pioneer) => (
          <PioneerCard key={pioneer.id} pioneer={pioneer} topicId={topicId} stepId={stepId} userAgeGroup={userAgeGroup} teachingMode={teachingMode} />
        ))}
      </div>
    </div>
  );
}

function PioneerCard({
  pioneer,
  topicId,
  stepId,
  userAgeGroup,
  teachingMode,
}: {
  pioneer: LessonBlockContent["pioneers"][number];
  topicId: string;
  stepId: string;
  userAgeGroup: UserAgeGroup;
  teachingMode: TeachingMode;
}) {
  const [open, setOpen] = useState(false);
  // A light pointer-tilt on hover — perspective + rotate driven by pointer
  // position within the card, not framer-motion's spring machinery
  // (Flashcard3D.tsx's click-triggered flip and MagneticButton.tsx's
  // whole-element lean are both shaped for a different interaction; this
  // card just wants to feel alive on hover, then open the full profile on
  // click, so a plain CSS transform is the lighter-weight fit).
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  function onPointerMove(e: MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: py * -6, y: px * 6 });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        onMouseMove={onPointerMove}
        onMouseLeave={() => setTilt({ x: 0, y: 0 })}
        style={{ perspective: 800 }}
        className="focus-ring block text-start"
      >
        <span
          className="flex flex-col gap-2 rounded-2xl border border-hairline-card bg-surface p-4 transition-[border-color,transform] duration-150 hover:border-accent-learning/30"
          style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`, transformStyle: "preserve-3d" }}
        >
          <span className="block">
            <span className="block text-sm font-semibold text-foreground">{pioneer.name}</span>
            <span className="block text-xs text-muted">
              {pioneer.role} · {pioneer.historicalEra}
            </span>
          </span>
          <span className="block text-xs leading-relaxed text-foreground/90">{pioneer.bio}</span>
          {pioneer.unusualFact && (
            <span className="block rounded-lg bg-fill-subtle px-2.5 py-1.5 text-xs text-foreground/80">
              <span className="font-medium text-accent-fitness">עובדה משעשעת: </span>
              {pioneer.unusualFact}
            </span>
          )}
        </span>
      </button>

      {open && (
        <PioneerProfileDrawer pioneer={pioneer} topicId={topicId} stepId={stepId} userAgeGroup={userAgeGroup} teachingMode={teachingMode} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function CoreContentSection({ coreContent }: { coreContent: string }) {
  return (
    <SectionCard title="להבין לעומק" icon={<Lightbulb size={15} className="text-accent-learning" aria-hidden />}>
      <LessonContentRenderer content={coreContent} />
    </SectionCard>
  );
}

function TriviaSection({ items }: { items: string[] }) {
  return (
    <SectionCard title="עובדות שיפוצצו לכם את הראש">
      <ul className="flex flex-col gap-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-foreground">
            <span className="mt-0.5 shrink-0 text-accent-learning">✦</span>
            {item}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function MemeSection({ meme }: { meme: LessonBlockContent["memeData"] }) {
  return (
    <SectionCard className="bg-fill-subtle/50">
      {meme.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- an arbitrary AI-suggested URL, not a domain next/image can be configured to optimize
        <img src={meme.imageUrl} alt="" className="mb-3 w-full rounded-xl object-cover" />
      )}
      <p className="text-sm font-medium text-foreground">{meme.jokeText}</p>
    </SectionCard>
  );
}

function CheckpointsSection({
  checkpoints,
  answers,
  onAnswered,
}: {
  checkpoints: InlineCheckpoint[];
  answers: Record<string, CheckpointAnswerState>;
  onAnswered: (checkpoint: InlineCheckpoint, selectedIndex: number, origin: Point | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-foreground">בדיקת הבנה</h3>
      {checkpoints.map((checkpoint) => (
        <CheckpointCard key={checkpoint.id} checkpoint={checkpoint} priorAnswer={answers[checkpoint.id]} onAnswered={onAnswered} />
      ))}
    </div>
  );
}

function CheckpointCard({
  checkpoint,
  priorAnswer,
  onAnswered,
}: {
  checkpoint: InlineCheckpoint;
  priorAnswer: CheckpointAnswerState | undefined;
  onAnswered: (checkpoint: InlineCheckpoint, selectedIndex: number, origin: Point | undefined) => void;
}) {
  const [selected, setSelected] = useState<number | null>(priorAnswer?.selectedIndex ?? null);
  // A prior answer arriving after first render (the fetch in LessonViewport
  // resolves after content is already on screen) should still pre-fill —
  // but never override a choice the person has made in this session.
  useEffect(() => {
    if (priorAnswer && selected === null) setSelected(priorAnswer.selectedIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priorAnswer]);

  const answered = selected !== null;
  const correct = selected === checkpoint.correctIndex;

  function choose(index: number, e: MouseEvent<HTMLButtonElement>) {
    setSelected(index);
    onAnswered(checkpoint, index, originOf(e.currentTarget));
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-hairline-card bg-surface p-4">
      <p className="text-sm font-medium text-foreground">{checkpoint.question}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {checkpoint.options.map((option, i) => {
          const isCorrectOption = i === checkpoint.correctIndex;
          return (
            <button
              key={i}
              onClick={(e) => choose(i, e)}
              disabled={answered}
              className={cn(
                "focus-ring rounded-xl border px-3 py-2 text-start text-sm transition-colors disabled:cursor-default",
                !answered && "border-hairline-card text-foreground hover:bg-fill-subtle",
                answered && isCorrectOption && "border-accent-health bg-accent-health/10 text-accent-health",
                answered && !isCorrectOption && i === selected && "border-accent-family bg-accent-family/10 text-accent-family",
                answered && !isCorrectOption && i !== selected && "border-hairline-card text-muted opacity-60"
              )}
            >
              {option}
            </button>
          );
        })}
      </div>
      {answered && (
        <>
          <p className="text-xs leading-relaxed text-foreground/90">
            {!correct && checkpoint.funnyDistractor && <span className="mb-1 block font-medium text-accent-family">{checkpoint.funnyDistractor}</span>}
            {checkpoint.explanation}
          </p>
          {!correct && (
            <button onClick={() => setSelected(null)} className="focus-ring flex w-fit items-center gap-1.5 text-xs font-medium text-accent-learning hover:opacity-80">
              <RotateCcw size={12} aria-hidden />
              נסה שוב
            </button>
          )}
        </>
      )}
    </div>
  );
}
