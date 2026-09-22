"use client";

import { Component, useCallback, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, ExternalLink, Lightbulb, PlayCircle, Quote, RotateCcw, Sparkles } from "lucide-react";
import { LessonViewportSkeleton } from "@/components/features/learning/LessonViewportSkeleton";
import type { LessonGenerateResponse } from "@/app/api/learning/lesson/generate/route";
import type { InlineCheckpoint, LessonBlockContent, TeachingMode, UserAgeGroup } from "@/types/learning";
import { cn } from "@/lib/utils";

const GENERIC_ERROR = "משהו השתבש ביצירת השיעור — נסה שוב";

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

function LessonErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div dir="rtl" className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-hairline-card p-10 text-center">
      <AlertTriangle size={28} className="text-accent-family" aria-hidden />
      <p className="text-sm text-foreground">{GENERIC_ERROR}</p>
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

// --- Viewport ------------------------------------------------------------

export interface LessonViewportProps {
  topicId: string;
  stepId: string;
  userAgeGroup: UserAgeGroup;
  teachingMode: TeachingMode;
  customEmphasis?: string;
}

type LoadState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; content: LessonBlockContent; cached: boolean };

export function LessonViewport(props: LessonViewportProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [retryToken, setRetryToken] = useState(0);
  const { topicId, stepId, userAgeGroup, teachingMode, customEmphasis } = props;

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/learning/lesson/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId, stepId, userAgeGroup, teachingMode, customEmphasis }),
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
  }, [topicId, stepId, userAgeGroup, teachingMode, customEmphasis]);

  useEffect(() => {
    void load();
    // retryToken intentionally re-triggers the same fetch on retry without
    // changing any of the actual request parameters above.
  }, [load, retryToken]);

  const retry = useCallback(() => setRetryToken((t) => t + 1), []);

  if (state.kind === "loading") return <LessonViewportSkeleton />;
  if (state.kind === "error") return <LessonErrorState onRetry={retry} />;

  return (
    <LessonErrorBoundary onRetry={retry}>
      <LessonContent content={state.content} />
    </LessonErrorBoundary>
  );
}

// --- Content sections ------------------------------------------------------

function LessonContent({ content }: { content: LessonBlockContent }) {
  return (
    <div dir="rtl" className="flex flex-col gap-6">
      <OriginStorySection originStory={content.originStory} />
      {content.pioneers.length > 0 && <PioneersSection pioneers={content.pioneers} />}
      <CoreContentSection coreContent={content.coreContent} />
      {content.blooperOrDisaster && <BlooperSection text={content.blooperOrDisaster} />}
      {content.mindBlowingTrivia.length > 0 && <TriviaSection items={content.mindBlowingTrivia} />}
      {content.memeData.jokeText && <MemeSection meme={content.memeData} />}
      {content.inAppMedia.youtubeVideoId && <MediaSection media={content.inAppMedia} />}
      {content.inlineCheckpoints.length > 0 && <CheckpointsSection checkpoints={content.inlineCheckpoints} />}
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

function PioneersSection({ pioneers }: { pioneers: LessonBlockContent["pioneers"] }) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-foreground">האנשים מאחורי הרעיון</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {pioneers.map((pioneer) => (
          <PioneerCard key={pioneer.id} pioneer={pioneer} />
        ))}
      </div>
    </div>
  );
}

function PioneerCard({ pioneer }: { pioneer: LessonBlockContent["pioneers"][number] }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-hairline-card bg-surface p-4 transition-colors hover:border-accent-learning/30">
      <div>
        <p className="text-sm font-semibold text-foreground">{pioneer.name}</p>
        <p className="text-xs text-muted">
          {pioneer.role} · {pioneer.historicalEra}
        </p>
      </div>
      <p className="text-xs leading-relaxed text-foreground/90">{pioneer.bio}</p>
      {pioneer.famousQuote && (
        <p className="flex items-start gap-1.5 text-xs italic text-accent-learning">
          <Quote size={12} className="mt-0.5 shrink-0" aria-hidden />
          &ldquo;{pioneer.famousQuote}&rdquo;
        </p>
      )}
      {pioneer.unusualFact && (
        <p className="rounded-lg bg-fill-subtle px-2.5 py-1.5 text-xs text-foreground/80">
          <span className="font-medium text-accent-fitness">עובדה משעשעת: </span>
          {pioneer.unusualFact}
        </p>
      )}
      {pioneer.externalLinks.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {pioneer.externalLinks.map((link, i) => (
            <a
              key={i}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring flex items-center gap-1 rounded-full border border-hairline-card px-2 py-0.5 text-[10px] text-muted transition-colors hover:text-foreground"
            >
              {link.title}
              <ExternalLink size={9} aria-hidden />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function CoreContentSection({ coreContent }: { coreContent: string }) {
  return (
    <SectionCard title="להבין לעומק" icon={<Lightbulb size={15} className="text-accent-learning" aria-hidden />}>
      {/* Plain text, not rendered Markdown — Phase 1 keeps this dependency-
          free; a real Markdown renderer (code blocks, headings) is a later
          phase's concern. whitespace-pre-wrap alone keeps the model's own
          paragraph breaks intact. */}
      <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">{coreContent}</p>
    </SectionCard>
  );
}

function BlooperSection({ text }: { text: string }) {
  return (
    <SectionCard title="כשלא הלך כמתוכנן" className="bg-accent-family/5">
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{text}</p>
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

function MediaSection({ media }: { media: LessonBlockContent["inAppMedia"] }) {
  if (!media.youtubeVideoId) return null;
  return (
    <SectionCard title="לצפייה" icon={<PlayCircle size={15} className="text-accent-learning" aria-hidden />}>
      <div className="aspect-video w-full overflow-hidden rounded-xl">
        <iframe
          src={`https://www.youtube.com/embed/${media.youtubeVideoId}`}
          title="סרטון השיעור"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="size-full"
        />
      </div>
      {media.videoChapters && media.videoChapters.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {media.videoChapters.map((chapter, i) => (
            <li key={i} className="flex items-center gap-2 text-xs text-muted">
              <span className="tabular-nums text-accent-learning">
                {Math.floor(chapter.time / 60)}:{(chapter.time % 60).toString().padStart(2, "0")}
              </span>
              {chapter.label}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function CheckpointsSection({ checkpoints }: { checkpoints: InlineCheckpoint[] }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-foreground">בדיקת הבנה</h3>
      {checkpoints.map((checkpoint) => (
        <CheckpointCard key={checkpoint.id} checkpoint={checkpoint} />
      ))}
    </div>
  );
}

function CheckpointCard({ checkpoint }: { checkpoint: InlineCheckpoint }) {
  const [selected, setSelected] = useState<number | null>(null);
  const answered = selected !== null;
  const correct = selected === checkpoint.correctIndex;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-hairline-card bg-surface p-4">
      <p className="text-sm font-medium text-foreground">{checkpoint.question}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {checkpoint.options.map((option, i) => {
          const isCorrectOption = i === checkpoint.correctIndex;
          return (
            <button
              key={i}
              onClick={() => setSelected(i)}
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
        <p className="text-xs leading-relaxed text-foreground/90">
          {!correct && checkpoint.funnyDistractor && <span className="mb-1 block font-medium text-accent-family">{checkpoint.funnyDistractor}</span>}
          {checkpoint.explanation}
        </p>
      )}
    </div>
  );
}
