"use client";

import { useMemo, useState } from "react";
import { BookOpen, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Send, Sparkles } from "lucide-react";
import { CourseQuiz } from "@/components/features/learning/CourseQuiz";
import { TheaterVideo } from "@/components/features/learning/TheaterVideo";
import { youtubeVideoId } from "@/lib/learning/youtube";
import {
  buildStages,
  clampStage,
  stageLabel,
  stageProgress,
} from "@/lib/learning/courseStages";
import { cn } from "@/lib/utils";
import type { CourseModule } from "@/lib/ai/courseModule";

interface LearningSplitViewProps {
  topicTitle: string;
  /** Optional YouTube URL to study alongside the material. */
  videoUrl?: string;
  /** Marks the studied resource complete — no manual "done" step. */
  onQuizComplete?: (percent: number) => void;
  onClose: () => void;
}

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

// The Learning Hub's study view: material on one side, the assistant on the
// other, each side scrolling independently.
//
// True 50/50 only from `lg` up. Below that the two halves stack — a 50%
// column on a phone gives roughly 24 characters per line, which is unusable
// for the long-form reading this view exists to present. Splitting at the
// breakpoint where each half is still a real column is what makes the split
// worth having.
export function LearningSplitView({ topicTitle, videoUrl, onQuizComplete, onClose }: LearningSplitViewProps) {
  const [module, setModule] = useState<CourseModule | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [completed, setCompleted] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);

  const videoId = videoUrl ? youtubeVideoId(videoUrl) : null;

  // Where the learner is in the course. Progression used to be a set of
  // checkboxes sitting beside the material; it is now the act of moving
  // through it, which is what "next" and "back" are for.
  const [stageIndex, setStageIndex] = useState(0);
  const stages = useMemo(() => (module ? buildStages(module) : []), [module]);
  const current = stages.length > 0 ? stages[clampStage(stageIndex, stages.length)] : null;
  const isFirst = stageIndex <= 0;
  const isLast = stageIndex >= stages.length - 1;

  const goTo = (index: number) => setStageIndex(clampStage(index, stages.length));

  async function loadModule() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/course-module", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topicTitle }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "לא הצלחנו לבנות את חומר הלימוד.");
        return;
      }
      setModule(data.module as CourseModule);
    } catch {
      setError("לא הצלחנו להגיע לשירות חומרי הלימוד.");
    } finally {
      setLoading(false);
    }
  }

  async function ask() {
    const text = question.trim();
    if (!text || asking) return;
    setQuestion("");
    setTurns((prev) => [...prev, { role: "user", content: text }]);
    setAsking(true);
    try {
      // Goes through the same chat route as the main assistant, so the
      // answer carries the user's real context — with the topic prepended so
      // the question is grounded in what they're studying rather than
      // floating free.
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `בהקשר של לימוד הנושא "${topicTitle}": ${text}` }),
      });
      if (!res.ok || !res.body) throw new Error("chat failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      setTurns((prev) => [...prev, { role: "assistant", content: "" }]);
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        setTurns((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: full };
          return next;
        });
      }
    } catch {
      setTurns((prev) => [...prev, { role: "assistant", content: "לא הצלחתי לענות כרגע. נסה שוב." }]);
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium text-muted">
          <BookOpen size={16} className="text-accent-learning" aria-hidden />
          {topicTitle}
          {/* Visual completion indicator — set automatically on quiz
              submission, never by a separate "mark as done" click. */}
          {completed && (
            <span className="flex items-center gap-1 text-xs text-accent-health">
              <CheckCircle2 size={13} aria-hidden />
              הושלם
            </span>
          )}
        </p>
        <button
          onClick={onClose}
          className="focus-ring glass-control rounded-lg px-3 py-1.5 text-xs text-foreground"
        >
          סגור
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ── Left: the course itself ── */}
        <section
          aria-label="חומר הלימוד"
          className="flex max-h-[70vh] min-w-0 flex-col gap-4 overflow-y-auto rounded-2xl border border-hairline-card bg-surface p-5"
        >
          {videoId && <TheaterVideo videoId={videoId} title={topicTitle} />}

          {!module && !loading && (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-muted">
                בנה חומר לימוד מעמיק לנושא הזה — הסבר מלא, נקודות מפתח ובוחן.
              </p>
              <button
                onClick={loadModule}
                className="focus-ring glass-control flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium text-foreground"
              >
                <Sparkles size={13} className="text-gold-ink" aria-hidden />
                בנה חומר לימוד
              </button>
            </div>
          )}

          {loading && (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Loader2 size={14} className="animate-spin" aria-hidden />
              כותב חומר לימוד מעמיק… זה לוקח כמה שניות.
            </p>
          )}

          {error && <p className="text-xs text-accent-family">{error}</p>}

          {module && current && (
            <article className="flex min-h-0 flex-1 flex-col gap-4">
              {/* Progress rail. Stage names rather than "3 / 5": the learner
                  can see what is behind and ahead, and jump, instead of
                  being told only how far along a number they are. */}
              <nav aria-label="שלבי הקורס" className="flex flex-col gap-2">
                <div className="h-0.5 w-full overflow-hidden rounded-full bg-fill-subtle">
                  <div
                    className="h-full rounded-full bg-[var(--gold)] transition-[width] duration-300"
                    style={{ width: `${stageProgress(stageIndex, stages.length) * 100}%` }}
                  />
                </div>
                <ol className="flex flex-wrap gap-1.5">
                  {stages.map((stage, i) => (
                    <li key={`${stage.kind}-${i}`}>
                      <button
                        onClick={() => goTo(i)}
                        aria-current={i === stageIndex ? "step" : undefined}
                        className={cn(
                          "focus-ring max-w-[10rem] truncate rounded-full px-2.5 py-1 text-[0.7rem] transition-colors",
                          i === stageIndex
                            ? "bg-gold-soft font-medium text-gold-ink"
                            : i < stageIndex
                              ? "text-muted hover:text-foreground"
                              : "text-muted/70 hover:text-foreground"
                        )}
                      >
                        {stageLabel(stage)}
                      </button>
                    </li>
                  ))}
                </ol>
              </nav>

              <div className="min-h-0 flex-1">
                {current.kind === "intro" && (
                  <section className="flex flex-col gap-3">
                    <h2 className="text-lg font-medium text-foreground">{current.title}</h2>
                    <p className="course-prose">{current.body}</p>
                  </section>
                )}

                {current.kind === "section" && (
                  <section className="flex flex-col gap-3">
                    <h3 className="text-base font-medium text-gold-ink">{current.heading}</h3>
                    {/* Preserves the paragraph breaks the model produced —
                        rendering long-form text as one block would undo the
                        structure that makes it readable. */}
                    <p className="course-prose">{current.body}</p>
                  </section>
                )}

                {current.kind === "takeaways" && (
                  <section className="flex flex-col gap-3 rounded-xl border border-hairline-card bg-surface-sunken/60 p-4">
                    <h3 className="text-base font-medium text-foreground">נקודות מפתח</h3>
                    <ul className="flex list-disc flex-col gap-2 pe-4 text-[0.95rem] leading-[1.85] text-foreground/85">
                      {current.items.map((point, i) => (
                        <li key={`${point}-${i}`}>{point}</li>
                      ))}
                    </ul>
                  </section>
                )}

                {current.kind === "quiz" && (
                  <CourseQuiz
                    questions={current.questions}
                    onComplete={(percent) => {
                      setCompleted(true);
                      onQuizComplete?.(percent);
                    }}
                    // The quiz is the last stage, so "past it" is the end of
                    // the course rather than another screen.
                    onSkip={() => setCompleted(true)}
                  />
                )}
              </div>

              {/* ChevronRight is "back" and ChevronLeft is "forward": the app
                  is RTL, so forward runs leftward. */}
              <div className="flex items-center justify-between gap-3 border-t border-hairline-card pt-3">
                <button
                  onClick={() => goTo(stageIndex - 1)}
                  disabled={isFirst}
                  className="glass-control focus-ring flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium text-foreground disabled:opacity-40"
                >
                  <ChevronRight size={14} aria-hidden />
                  חזור
                </button>

                <span className="ltr text-[0.7rem] tabular-nums text-muted">
                  {stageIndex + 1} / {stages.length}
                </span>

                <button
                  onClick={() => goTo(stageIndex + 1)}
                  disabled={isLast}
                  className="glass-control focus-ring flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium text-foreground disabled:opacity-40"
                >
                  הבא
                  <ChevronLeft size={14} aria-hidden />
                </button>
              </div>
            </article>
          )}
        </section>

        {/* ── Right: the assistant, in this topic's context ── */}
        <section
          aria-label="Life Plus Assistant"
          className="flex max-h-[70vh] min-w-0 flex-col rounded-2xl border border-hairline-card bg-surface p-5"
        >
          <p className="mb-3 flex items-center gap-2 text-sm font-medium text-muted">
            <Sparkles size={15} className="text-gold-ink" aria-hidden />
            Life Plus Assistant
          </p>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            {turns.length === 0 ? (
              <p className="text-xs text-muted">
                שאל כל דבר על החומר — התשובות מגיעות בהקשר של הנושא שאתה לומד עכשיו.
              </p>
            ) : (
              turns.map((turn, i) => (
                <div
                  key={i}
                  className={
                    turn.role === "user"
                      ? "self-start rounded-xl bg-gold-soft px-3 py-2 text-sm text-gold-ink"
                      : "rounded-xl bg-surface-sunken/70 px-3 py-2 text-sm leading-relaxed text-foreground/85"
                  }
                >
                  {turn.content || "…"}
                </div>
              ))
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask()}
              placeholder="שאל על החומר…"
              aria-label="שאלה לעוזר הלימוד"
              className="focus-ring flex-1 rounded-lg border border-hairline-card bg-surface-sunken px-3 py-2 text-sm text-foreground placeholder:text-muted"
            />
            <button
              onClick={ask}
              disabled={!question.trim() || asking}
              className="focus-ring glass-control flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-foreground disabled:opacity-40"
            >
              {asking ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Send size={13} aria-hidden />}
              שלח
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
