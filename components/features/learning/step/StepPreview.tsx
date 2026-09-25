"use client";

import { memo, useCallback, useId, useState, type MouseEvent, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { retryImport } from "@/lib/dynamicImport";
import { motion } from "framer-motion";
import { AlertTriangle, BookOpenCheck, Brain, Check, ChevronDown, GraduationCap, Layers, Loader2, Network, RotateCcw, Users } from "lucide-react";
import { ResourceLauncher } from "@/components/features/learning/ResourceLauncher";
import { RESOURCE_ICON, RESOURCE_LABEL } from "@/components/features/learning/lab/labels";
import { originOf } from "@/components/features/learning/lab/LabContext";
import { useLabReducedMotion } from "@/components/features/learning/lab/useLabMotion";
import { useResourceCompletion } from "@/components/features/learning/lab/useResourceCompletion";
import { ConceptMatch } from "@/components/features/learning/step/ConceptMatch";
import { FeynmanCheck } from "@/components/features/learning/step/FeynmanCheck";
import { NarrationPlayer } from "@/components/features/learning/step/NarrationPlayer";
import { PracticeCard } from "@/components/features/learning/step/PracticeCard";
import { RecallCheck } from "@/components/features/learning/step/RecallCheck";
import { StepVisual } from "@/components/features/learning/step/StepVisual";
import { useStepBrief, type StepBriefState } from "@/components/features/learning/step/useStepBrief";
import { addLearningFlashcardsAction } from "@/app/actions/learningFlashcards";
import { streamingPreview } from "@/lib/learning/stepBrief";
import { xpForResource } from "@/lib/learning/xp";
import type { StepBriefContent, StepConcept } from "@/types/learning";
import type { LearningResource, LearningTopic } from "@/types";
import { cn } from "@/lib/utils";

// The mind map is the heaviest, least-needed-first part of the canvas: split
// out so the step's text paints without waiting for it. retryImport: a
// transient chunk-load failure (a real, live "Failed to load chunk" report
// 2026-09-25) resolves on its own instead of falling all the way to
// app/error.tsx's boundary — see that file's own comment for the other half
// (a genuinely STALE chunk after a new deploy, which no retry can fix and
// needs a reload instead).
const ConceptGraph = dynamic(() => retryImport(() => import("@/components/features/learning/step/ConceptGraph")), {
  ssr: false,
  loading: () => <div className="aspect-[7/4] w-full rounded-2xl bg-fill-subtle/40" aria-hidden />,
});

interface StepPreviewProps {
  topic: LearningTopic;
  resource: LearningResource;
  index: number;
  total: number;
  /** The video player, when the step is a playable video — rendered at the top of the canvas. */
  media?: ReactNode;
  onOpenLesson: (resource: LearningResource) => void;
}

/**
 * The topic canvas's main surface: the step selected on the timeline, as a
 * study page — a streamed, cached AI brief (useStepBrief) laid out as
 * summary → concepts → diagram → active recall → explain-it-back → practice.
 */
export const StepPreview = memo(function StepPreview({ topic, resource, index, total, media, onOpenLesson }: StepPreviewProps) {
  const complete = useResourceCompletion();
  const { state, retry } = useStepBrief(topic.id, resource.id);
  const [error, setError] = useState<string | null>(null);
  const Icon = RESOURCE_ICON[resource.type];
  const done = resource.isCompleted;

  const toggleDone = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      setError(null);
      complete(resource, !resource.isCompleted, originOf(e.currentTarget)).catch(() => setError("העדכון לא נשמר."));
    },
    [complete, resource]
  );

  return (
    <article aria-labelledby={`step-title-${resource.id}`} className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <p className="flex items-center gap-2 text-xs text-muted">
          <Icon size={13} className="text-accent-learning" aria-hidden />
          <span>
            שלב <span className="tabular-nums">{index + 1}</span> מתוך <span className="tabular-nums">{total}</span> · {RESOURCE_LABEL[resource.type]}
          </span>
          <span className="rounded-full bg-[color-mix(in_srgb,var(--gold)_16%,transparent)] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-gold-ink">
            {done ? "✓ " : "+"}
            {xpForResource(resource.type)} XP
          </span>
        </p>
        <h3 id={`step-title-${resource.id}`} className="text-xl font-semibold leading-snug text-foreground sm:text-2xl">
          {resource.title}
        </h3>
        {resource.notes && <p className="whitespace-pre-line text-sm text-muted">{resource.notes}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleDone}
            aria-pressed={done}
            className={cn(
              "focus-ring flex min-h-11 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold transition-colors",
              done ? "bg-accent-learning/15 text-accent-learning" : "bg-accent-learning text-background hover:opacity-90"
            )}
          >
            <Check size={15} aria-hidden />
            {done ? "הושלם" : "סמן כהושלם"}
          </button>
          <button
            type="button"
            onClick={() => onOpenLesson(resource)}
            className="focus-ring flex min-h-11 items-center gap-1.5 rounded-xl border border-accent-learning/30 px-4 text-sm font-medium text-accent-learning transition-colors hover:bg-accent-learning/10"
          >
            <GraduationCap size={15} aria-hidden />
            שיעור אמן מלא
          </button>
          {resource.url && resource.type !== "youtube" && <ResourceLauncher url={resource.url} title={resource.title} />}
        </div>
        {error && (
          <p role="alert" className="text-xs text-accent-family">
            {error}
          </p>
        )}
      </header>

      {media}

      <BriefBody state={state} retry={retry} topic={topic} resource={resource} />
    </article>
  );
});

// --- The brief, by load state -----------------------------------------------

function BriefBody({ state, retry, topic, resource }: { state: StepBriefState; retry: () => void; topic: LearningTopic; resource: LearningResource }) {
  const status =
    state.kind === "loading" ? "מכין את תקציר השלב…" : state.kind === "streaming" ? "התקציר נכתב עכשיו…" : state.kind === "ready" ? "תקציר השלב מוכן." : state.kind === "error" ? state.message : "";

  return (
    <div className="flex flex-col gap-8">
      {/* One polite live region for the whole brief's lifecycle — not the
          streaming text itself, which would make a screen reader re-read the
          growing summary on every chunk. */}
      <p aria-live="polite" className="sr-only">
        {status}
      </p>

      {(state.kind === "loading" || state.kind === "idle") && <BriefSkeleton />}

      {state.kind === "streaming" && <StreamingBrief partial={state.partial} />}

      {state.kind === "error" && (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-hairline-card p-8 text-center">
          <AlertTriangle size={24} className="text-accent-family" aria-hidden />
          <p className="text-sm text-foreground">{state.message}</p>
          <button type="button" onClick={retry} className="focus-ring flex min-h-11 items-center gap-1.5 rounded-xl bg-accent-learning/15 px-4 text-sm font-medium text-accent-learning">
            <RotateCcw size={14} aria-hidden />
            נסה שוב
          </button>
        </div>
      )}

      {state.kind === "ready" && <ReadyBrief content={state.content} topic={topic} resource={resource} />}
    </div>
  );
}

/** Reserves roughly the final layout so nothing jumps when content lands. */
function BriefSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-6">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Loader2 size={13} className="animate-spin text-accent-learning" />
        מכין את תקציר השלב…
      </div>
      <div className="flex flex-col gap-2">
        {[100, 96, 88, 60].map((w) => (
          <div key={w} className="h-3.5 animate-pulse rounded-full bg-fill-subtle" style={{ width: `${w}%` }} />
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-2xl bg-fill-subtle/70" />
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-2xl bg-fill-subtle/50" />
    </div>
  );
}

function StreamingBrief({ partial }: { partial: unknown }) {
  const { summary, concepts } = streamingPreview(partial);
  return (
    <div className="flex flex-col gap-6">
      <Section icon={<BookOpenCheck size={16} aria-hidden />} title="בקצרה">
        <p className="text-[0.95rem] leading-relaxed text-foreground">
          {summary || <span className="text-muted">כותב…</span>}
          <span aria-hidden className="ms-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-pulse bg-accent-learning" />
        </p>
      </Section>
      {concepts.length > 0 && (
        <Section icon={<Brain size={16} aria-hidden />} title="מושגי יסוד">
          <ul className="grid gap-2 sm:grid-cols-2">
            {concepts.map((c) => (
              <li key={c.term} className="rounded-2xl border border-hairline-card bg-surface p-3">
                <p className="text-sm font-semibold text-foreground">{c.term}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{c.definition}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <div aria-hidden className="h-40 animate-pulse rounded-2xl bg-fill-subtle/50" />
    </div>
  );
}

function ReadyBrief({ content, topic, resource }: { content: StepBriefContent; topic: LearningTopic; resource: LearningResource }) {
  const reduce = useLabReducedMotion();
  const narration = [content.summary, ...content.coreConcepts.map((c) => `${c.term}: ${c.definition}`)].join(". ");
  const hasGraph = content.coreConcepts.length >= 3 && content.coreConcepts.some((c) => c.relatedTo.length > 0);

  return (
    <motion.div initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} className="flex flex-col gap-8">
      <NarrationPlayer text={narration} title={resource.title} />

      <Section icon={<BookOpenCheck size={16} aria-hidden />} title="בקצרה">
        <p className="text-[0.95rem] leading-relaxed text-foreground">{content.summary}</p>
      </Section>

      <Section icon={<Brain size={16} aria-hidden />} title="מושגי יסוד" action={<SaveFlashcards topicId={topic.id} concepts={content.coreConcepts} />}>
        <ConceptAccordion concepts={content.coreConcepts} />
      </Section>

      {hasGraph && (
        <Section icon={<Network size={16} aria-hidden />} title="מפת מושגים">
          <ConceptGraph concepts={content.coreConcepts} />
        </Section>
      )}

      {content.visual.kind !== "none" && (
        <Section icon={<Layers size={16} aria-hidden />} title={content.visual.kind === "process" ? "התהליך, שלב אחר שלב" : "השוואה"}>
          <StepVisual visual={content.visual} />
        </Section>
      )}

      {content.keyFigures.length > 0 && (
        <Section icon={<Users size={16} aria-hidden />} title="דמויות מפתח">
          <ul className="grid gap-2 sm:grid-cols-2">
            {content.keyFigures.map((f) => (
              <li key={f.name} className="rounded-2xl border border-hairline-card bg-surface p-3">
                <p className="text-sm font-semibold text-foreground">{f.name}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{f.contribution}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(content.recall.length > 0 || content.coreConcepts.length >= 2) && (
        <Section icon={<span aria-hidden>✍️</span>} title="בדוק את עצמך" subtitle="שליפה מהזיכרון מקבעת ידע טוב יותר מקריאה חוזרת.">
          <div className="flex flex-col gap-3">
            {content.recall.map((item, i) => (
              <RecallCheck key={`${resource.id}-${i}`} item={item} index={i} />
            ))}
            <ConceptMatch concepts={content.coreConcepts} seed={resource.id} />
          </div>
        </Section>
      )}

      <Section icon={<span aria-hidden>🗣️</span>} title="הסבר את זה בחזרה" subtitle="שיטת פיינמן: אם אפשר להסביר בפשטות — הבנת.">
        <FeynmanCheck topicTitle={topic.title} concept={content.feynmanConcept} />
      </Section>

      <Section icon={<span aria-hidden>🚀</span>} title="ליישם בעולם האמיתי">
        <PracticeCard practice={content.practice} topicTitle={topic.title} />
      </Section>
    </motion.div>
  );
}

// --- Pieces -------------------------------------------------------------------

function Section({ icon, title, subtitle, action, children }: { icon: ReactNode; title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h4 id={id} className="flex items-center gap-2 text-base font-semibold text-foreground">
            <span className="text-accent-learning">{icon}</span>
            {title}
          </h4>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

const ConceptAccordion = memo(function ConceptAccordion({ concepts }: { concepts: readonly StepConcept[] }) {
  const baseId = useId();
  const [open, setOpen] = useState<number | null>(0);
  return (
    <ul className="flex flex-col gap-2">
      {concepts.map((c, i) => {
        const expanded = open === i;
        const panelId = `${baseId}-panel-${i}`;
        return (
          <li key={c.term} className="rounded-2xl border border-hairline-card bg-surface">
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={() => setOpen(expanded ? null : i)}
              className="focus-ring flex min-h-11 w-full items-center justify-between gap-2 rounded-2xl px-4 py-2 text-start"
            >
              <span className="text-sm font-semibold text-foreground">{c.term}</span>
              <ChevronDown size={16} className={cn("shrink-0 text-muted transition-transform duration-200", expanded && "rotate-180")} aria-hidden />
            </button>
            <div id={panelId} role="region" aria-label={c.term} hidden={!expanded} className="px-4 pb-3">
              <p className="text-sm leading-relaxed text-foreground/90">{c.definition}</p>
              {c.relatedTo.length > 0 && <p className="mt-1.5 text-[11px] text-muted">קשור ל: {c.relatedTo.join(" · ")}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
});

/**
 * Turns the step's concepts into spaced-repetition flashcards — the existing
 * SM-2 deck (srs_cards, MasteryTab), which tracks each card's memory decay
 * and schedules its review. No second flashcard system.
 */
function SaveFlashcards({ topicId, concepts }: { topicId: string; concepts: readonly StepConcept[] }) {
  const [state, setState] = useState<"idle" | "busy" | "saved" | "error">("idle");
  async function save() {
    setState("busy");
    try {
      await addLearningFlashcardsAction(
        topicId,
        concepts.map((c) => ({ front: c.term, back: c.definition }))
      );
      setState("saved");
    } catch {
      setState("error");
    }
  }
  if (state === "saved") {
    return (
      <span role="status" className="flex min-h-11 items-center gap-1 text-xs font-medium text-accent-health">
        <Check size={13} aria-hidden />
        נשמרו {concepts.length} כרטיסיות לחזרה מרווחת
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => void save()}
      disabled={state === "busy"}
      className="focus-ring flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-accent-learning transition-colors hover:bg-accent-learning/10 disabled:opacity-50"
    >
      {state === "busy" ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Layers size={13} aria-hidden />}
      {state === "error" ? "נכשל — נסה שוב" : "שמור ככרטיסיות"}
    </button>
  );
}
