"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Brain, Check, GraduationCap, Loader2, Send, Sparkles } from "lucide-react";
import { HeroVideoDialog } from "@/components/magicui/hero-video-dialog";
import {
  applyMasteryDelta,
  masteryLabel,
  type StudyGrade,
  type StudyOverview,
  type StudyQuiz,
  type StudySummary,
} from "@/lib/ai/agents/studyAgent";
import { youtubeEmbedUrl, youtubeThumbnailUrl, youtubeVideoId } from "@/lib/learning/youtube";
import { cn } from "@/lib/utils";

const VERDICT_STYLE: Record<StudyGrade["verdict"], string> = {
  correct: "text-accent-health",
  partial: "text-gold-ink",
  incorrect: "text-accent-family",
};

const VERDICT_LABEL: Record<StudyGrade["verdict"], string> = {
  correct: "נכון",
  partial: "חלקית נכון",
  incorrect: "לא מדויק",
};

// The in-app video hub: the player on one side, the StudyAgent on the other.
// The transcript is fetched once and reused for every agent call, so
// summarizing and then being quizzed doesn't re-hit YouTube each time.
export function VideoStudyPanel() {
  const reduce = useReducedMotion();

  const [urlInput, setUrlInput] = useState("");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ title: string; author: string | null } | null>(null);
  const [overview, setOverview] = useState<StudyOverview | null>(null);

  const [summary, setSummary] = useState<StudySummary | null>(null);
  const [quiz, setQuiz] = useState<StudyQuiz | null>(null);
  const [asked, setAsked] = useState<string[]>([]);
  const [answer, setAnswer] = useState("");
  const [grade, setGrade] = useState<StudyGrade | null>(null);
  const [mastery, setMastery] = useState(0);

  const [busy, setBusy] = useState<null | "load" | "summary" | "quiz" | "grade">(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTranscript(null);
    setMeta(null);
    setOverview(null);
    setSummary(null);
    setQuiz(null);
    setAsked([]);
    setAnswer("");
    setGrade(null);
    setMastery(0);
  }

  async function loadVideo() {
    const id = youtubeVideoId(urlInput);
    if (!id) {
      setError("זה לא נראה כמו קישור YouTube תקין.");
      return;
    }
    setError(null);
    setBusy("load");
    setVideoId(id);
    reset();
    try {
      const res = await fetch("/api/ai/fetch-youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${id}` }),
      });
      const data = await res.json();
      if (data.meta && typeof data.meta.title === "string") {
        setMeta({ title: data.meta.title, author: data.meta.author ?? null });
      }
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "לא הצלחנו לטעון את הסרטון.");
        return;
      }
      // { text } when captions exist; { meta, transcriptError } otherwise.
      if (typeof data.text === "string") {
        setTranscript(data.text);
      } else if (typeof data.transcriptError === "string") {
        setError(`${data.transcriptError} עוזר הלימוד ייתן סקירה לפי כותרת הסרטון.`);
      }
    } catch {
      setError("לא הצלחנו להגיע לשירות התמלול.");
    } finally {
      setBusy(null);
    }
  }

  async function callAgent(body: Record<string, unknown>, mode: "summary" | "quiz" | "grade") {
    if (!transcript) return null;
    setBusy(mode);
    setError(null);
    try {
      const res = await fetch("/api/ai/study-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, transcript }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "עוזר הלימוד נכשל.");
        return null;
      }
      return data;
    } catch {
      setError("לא הצלחנו להגיע לעוזר הלימוד.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function getSummary() {
    if (transcript) {
      const data = await callAgent({ mode: "summary" }, "summary");
      if (data?.summary) setSummary(data.summary as StudySummary);
      return;
    }
    // No transcript — best-effort overview from the video's title + channel.
    if (!meta) return;
    setBusy("summary");
    setError(null);
    try {
      const res = await fetch("/api/ai/study-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "overview", videoTitle: meta.title, channel: meta.author ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "עוזר הלימוד נכשל.");
        return;
      }
      if (data?.overview) setOverview(data.overview as StudyOverview);
    } catch {
      setError("לא הצלחנו להגיע לעוזר הלימוד.");
    } finally {
      setBusy(null);
    }
  }

  async function getQuiz() {
    const data = await callAgent({ mode: "quiz", mastery, askedQuestions: asked }, "quiz");
    if (data?.quiz) {
      const next = data.quiz as StudyQuiz;
      setQuiz(next);
      setAsked((prev) => [...prev, next.question]);
      setGrade(null);
      setAnswer("");
    }
  }

  async function submitAnswer() {
    if (!quiz || !answer.trim()) return;
    const data = await callAgent(
      { mode: "discuss", question: quiz.question, answer: answer.trim() },
      "grade"
    );
    if (data?.grade) {
      const next = data.grade as StudyGrade;
      setGrade(next);
      setMastery((m) => applyMasteryDelta(m, next.masteryDelta));
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-2">
        <input
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && loadVideo()}
          placeholder="הדבק קישור YouTube כדי ללמוד מתוך Life Plus"
          aria-label="קישור לסרטון YouTube"
          className="focus-ring ltr flex-1 rounded-xl border border-hairline-card bg-surface-sunken px-3 py-2.5 text-sm text-foreground placeholder:text-muted"
          dir="ltr"
        />
        <button
          onClick={loadVideo}
          disabled={!urlInput.trim() || busy === "load"}
          className="focus-ring flex shrink-0 items-center gap-1.5 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-[var(--background)] transition-opacity disabled:opacity-40"
        >
          {busy === "load" ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Send size={14} aria-hidden />}
          טען
        </button>
      </div>

      {error && (
        <p role="alert" className="text-xs text-accent-family">
          {error}
        </p>
      )}

      {videoId && (
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div className="flex flex-col gap-3">
            <HeroVideoDialog
              videoSrc={youtubeEmbedUrl(videoId)}
              thumbnailSrc={youtubeThumbnailUrl(videoId)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={getSummary}
                disabled={(!transcript && !meta) || busy !== null}
                className="focus-ring flex items-center gap-1.5 rounded-lg border border-hairline-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-fill-subtle disabled:opacity-40"
              >
                {busy === "summary" ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Sparkles size={13} className="text-gold-ink" aria-hidden />}
                סכם את הסרטון
              </button>
              <button
                onClick={getQuiz}
                disabled={!transcript || busy !== null}
                className="focus-ring flex items-center gap-1.5 rounded-lg border border-hairline-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-fill-subtle disabled:opacity-40"
              >
                {busy === "quiz" ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <GraduationCap size={13} className="text-accent-learning" aria-hidden />}
                {quiz ? "שאלה נוספת" : "בחן אותי"}
              </button>
            </div>
          </div>

          {/* Tutor column */}
          <div className="flex flex-col gap-4 rounded-2xl border border-hairline-card bg-surface p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm font-medium text-muted">
                <Brain size={15} className="text-accent-learning" aria-hidden />
                עוזר הלימוד
              </span>
              <span className="flex items-center gap-2 text-xs text-muted">
                <span className="ltr tabular-nums text-gold-ink">{mastery}%</span>
                {masteryLabel(mastery)}
              </span>
            </div>

            <div
              className="h-1 overflow-hidden rounded-full bg-fill-subtle"
              role="progressbar"
              aria-valuenow={mastery}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="רמת שליטה בחומר"
            >
              <motion.div
                className="h-full rounded-full bg-[var(--gold)]"
                initial={false}
                animate={{ width: `${mastery}%` }}
                transition={reduce ? { duration: 0 } : { duration: 0.4, ease: "easeOut" }}
              />
            </div>

            {!transcript && (
              <p className="text-xs text-muted">
                {meta
                  ? "אין תמלול לסרטון — הסיכום יהיה סקירה לפי הכותרת והנושא. הבוחן זמין רק עם תמלול."
                  : "טען סרטון כדי להתחיל."}
              </p>
            )}

            <AnimatePresence mode="wait">
              {overview && !summary && (
                <motion.div
                  key="overview"
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
                  className="flex flex-col gap-2 border-t border-hairline-card pt-3"
                >
                  <p className="text-sm font-medium text-foreground">{overview.headline}</p>
                  <ul className="flex list-disc flex-col gap-1 pe-4 text-xs leading-relaxed text-foreground/80">
                    {overview.keyPoints.map((point, i) => (
                      <li key={`${point}-${i}`}>{point}</li>
                    ))}
                  </ul>
                  <p className="rounded-lg bg-gold-soft px-3 py-2 text-xs text-gold-ink">{overview.takeaway}</p>
                  <p className="text-[0.65rem] italic text-muted">{overview.basis}</p>
                </motion.div>
              )}
              {summary && (
                <motion.div
                  key="summary"
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
                  className="flex flex-col gap-2 border-t border-hairline-card pt-3"
                >
                  <p className="text-sm font-medium text-foreground">{summary.headline}</p>
                  <ul className="flex list-disc flex-col gap-1 pe-4 text-xs leading-relaxed text-foreground/80">
                    {summary.keyPoints.map((point, i) => (
                      <li key={`${point}-${i}`}>{point}</li>
                    ))}
                  </ul>
                  <p className="rounded-lg bg-gold-soft px-3 py-2 text-xs text-gold-ink">{summary.takeaway}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {quiz && (
              <div className="flex flex-col gap-2 border-t border-hairline-card pt-3">
                <p className="text-sm text-foreground">{quiz.question}</p>
                {quiz.hint && <p className="text-xs text-muted">רמז: {quiz.hint}</p>}
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  rows={3}
                  placeholder="ענה במילים שלך…"
                  aria-label="התשובה שלך"
                  className="focus-ring w-full resize-none rounded-xl border border-hairline-card bg-surface-sunken px-3 py-2 text-sm text-foreground placeholder:text-muted"
                />
                <button
                  onClick={submitAnswer}
                  disabled={!answer.trim() || busy !== null}
                  className="focus-ring flex items-center justify-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-xs font-medium text-[var(--background)] transition-opacity disabled:opacity-40"
                >
                  {busy === "grade" ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Check size={13} aria-hidden />}
                  שלח תשובה
                </button>

                {grade && (
                  <div className="flex flex-col gap-1 border-t border-hairline-card pt-2">
                    <p className={cn("text-xs font-medium", VERDICT_STYLE[grade.verdict])}>
                      {VERDICT_LABEL[grade.verdict]}
                    </p>
                    <p className="text-xs leading-relaxed text-foreground/80">{grade.feedback}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
