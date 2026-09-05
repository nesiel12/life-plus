"use client";

import { useState } from "react";
import { BookOpen, CheckCircle2, Loader2, Send, Sparkles } from "lucide-react";
import { CourseQuiz } from "@/components/features/learning/CourseQuiz";
import { InlineVideoPlayer } from "@/components/features/learning/InlineVideoPlayer";
import { youtubeVideoId } from "@/lib/learning/youtube";
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
          {videoId && <InlineVideoPlayer videoId={videoId} title={topicTitle} />}

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

          {module && (
            <article className="flex flex-col gap-5">
              <header className="flex flex-col gap-2">
                <h2 className="text-lg font-medium text-foreground">{module.title}</h2>
                <p className="text-sm leading-relaxed text-foreground/80">{module.intro}</p>
              </header>

              {module.sections.map((section, i) => (
                <section key={`${section.heading}-${i}`} className="flex flex-col gap-2">
                  <h3 className="text-sm font-medium text-gold-ink">{section.heading}</h3>
                  {/* Preserves the paragraph breaks the model produced —
                      rendering long-form text as one block would undo the
                      structure that makes it readable. */}
                  <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/80">{section.body}</p>
                </section>
              ))}

              <section className="flex flex-col gap-2 rounded-xl border border-hairline-card bg-surface-sunken/60 p-4">
                <h3 className="text-sm font-medium text-foreground">נקודות מפתח</h3>
                <ul className="flex list-disc flex-col gap-1.5 pe-4 text-sm leading-relaxed text-foreground/80">
                  {module.keyTakeaways.map((point, i) => (
                    <li key={`${point}-${i}`}>{point}</li>
                  ))}
                </ul>
              </section>

              <CourseQuiz
                questions={module.quiz}
                onComplete={(percent) => {
                  setCompleted(true);
                  onQuizComplete?.(percent);
                }}
              />
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
