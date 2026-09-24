"use client";

import { memo, useCallback, useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { GraduationCap, Loader2, Play, Search, Sparkles, Trash2 } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { MagneticButton } from "@/components/features/learning/lab/MagneticButton";
import { RESOURCE_ICON, RESOURCE_LABEL } from "@/components/features/learning/lab/labels";
import { originOf } from "@/components/features/learning/lab/LabContext";
import { useLabReducedMotion } from "@/components/features/learning/lab/useLabMotion";
import { useResourceCompletion } from "@/components/features/learning/lab/useResourceCompletion";
import { youtubeSearchUrl } from "@/lib/learning/youtube";
import { topicProgress, topicXp, xpForResource } from "@/lib/learning/xp";
import { cn } from "@/lib/utils";
import type { LearningResource, LearningTopic } from "@/types";

interface SyllabusQuestProps {
  topic: LearningTopic;
  resources: readonly LearningResource[];
  /** The step shown in the canvas's live preview. */
  selectedId: string | null;
  /** Selecting a step (click, or ArrowUp/ArrowDown/Home/End) previews it in the canvas. */
  onSelect: (resource: LearningResource, via?: "pointer" | "keyboard") => void;
  /** Opens the Masterclass & Gaming OS classroom for this step (ClassroomViewport, owned by TopicCanvasModal). */
  onOpenLesson: (resource: LearningResource) => void;
}

/**
 * A topic's resources as a quest: a path of steps, each worth XP, that fill in as
 * you finish them.
 *
 * Ticking a step does everything at once — a strikethrough sweeps across the
 * title, the check draws itself, the ring and the XP count update, a chime plays,
 * "+50 XP" floats up, and finishing the last step sets off fireworks. All of that
 * runs through useResourceCompletion, so a video watched to the end reacts
 * exactly as a tick does.
 */
export const SyllabusQuest = memo(function SyllabusQuest({ topic, resources, selectedId, onSelect, onOpenLesson }: SyllabusQuestProps) {
  const reduce = useLabReducedMotion();
  const complete = useResourceCompletion();
  const removeResource = useAtlasStore((s) => s.deleteLearningResource);
  const generatePath = useAtlasStore((s) => s.generateLearningPath);

  const [error, setError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);

  const progress = topicProgress(resources);
  const xp = topicXp(resources);
  // The step to do next: the first one not yet finished.
  const currentId = useMemo(() => resources.find((r) => !r.isCompleted)?.id ?? null, [resources]);

  const toggle = useCallback(
    async (resource: LearningResource, e: MouseEvent<HTMLButtonElement>) => {
      setError(null);
      try {
        await complete(resource, !resource.isCompleted, originOf(e.currentTarget));
      } catch {
        setError("העדכון לא נשמר.");
      }
    },
    [complete]
  );

  const remove = useCallback(
    (resource: LearningResource) => {
      removeResource(resource.id).catch(() => setError("המחיקה לא נשמרה."));
    },
    [removeResource]
  );

  // Timeline keyboard navigation: with focus on a step's title, ArrowUp/Down
  // move to the previous/next step (and preview it), Home/End jump to the
  // ends. Enter/Space select, as any button does.
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLOListElement>) => {
      const target = e.target as HTMLElement;
      const currentId = target.dataset.stepSelect;
      if (!currentId) return;
      const index = resources.findIndex((r) => r.id === currentId);
      if (index === -1) return;
      const nextIndex =
        e.key === "ArrowDown" ? index + 1 : e.key === "ArrowUp" ? index - 1 : e.key === "Home" ? 0 : e.key === "End" ? resources.length - 1 : null;
      if (nextIndex === null) return;
      e.preventDefault();
      const next = resources[Math.min(resources.length - 1, Math.max(0, nextIndex))];
      if (!next) return;
      onSelect(next, "keyboard");
      e.currentTarget.querySelector<HTMLElement>(`[data-step-select="${next.id}"]`)?.focus();
    },
    [resources, onSelect]
  );

  async function build() {
    setBuilding(true);
    setError(null);
    try {
      await generatePath(topic.id, topic.title);
    } catch {
      setError("לא הצלחנו לבנות מסלול כרגע. נסה שוב.");
    } finally {
      setBuilding(false);
    }
  }

  return (
    <section aria-label="מסלול הלימוד" className="flex flex-col gap-4">
      <header className="flex items-center gap-4">
        <ProgressRing
          value={progress.fraction}
          size={64}
          stroke={6}
          color="var(--accent-learning)"
          label={`${progress.done} מתוך ${progress.total} שלבים הושלמו`}
        >
          <span className="ltr text-xs font-bold tabular-nums text-foreground">
            <NumberTicker value={Math.round(progress.fraction * 100)} />%
          </span>
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-foreground">מסלול הלימוד</h3>
          <p className="text-xs text-muted">
            <span className="tabular-nums">{progress.done}</span> מתוך <span className="tabular-nums">{progress.total}</span> שלבים
            {xp > 0 && (
              <>
                {" "}
                · <span className="font-semibold text-gold-ink">{xp} XP</span>
              </>
            )}
          </p>
        </div>
        <MagneticButton
          onClick={() => void build()}
          disabled={building}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-accent-learning/15 px-3.5 py-2 text-sm font-medium text-accent-learning transition-opacity disabled:opacity-60"
        >
          {building ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
          {building ? "בונה…" : resources.length ? "הוסף עוד שלבים" : "בנה לי מסלול"}
        </MagneticButton>
      </header>

      {resources.length === 0 && !building && (
        <p className="rounded-2xl border border-dashed border-hairline-card p-5 text-center text-sm text-muted">
          עדיין אין שלבים בנושא הזה. לחץ על &quot;בנה לי מסלול&quot; ו-AI יציע מסלול לימוד.
        </p>
      )}

      {resources.length > 0 && (
        <p id={`timeline-help-${topic.id}`} className="sr-only">
          חצים למעלה ולמטה עוברים בין השלבים ומציגים אותם.
        </p>
      )}
      <ol aria-label="שלבי המסלול" aria-describedby={`timeline-help-${topic.id}`} onKeyDown={onKeyDown} className="relative flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {resources.map((resource, index) => (
            <QuestStep
              key={resource.id}
              resource={resource}
              index={index}
              isLast={index === resources.length - 1}
              current={resource.id === currentId}
              selected={resource.id === selectedId}
              reduce={reduce}
              onToggle={toggle}
              onSelect={onSelect}
              onOpenLesson={onOpenLesson}
              onRemove={remove}
            />
          ))}
        </AnimatePresence>
      </ol>

      {error && (
        <p role="alert" className="text-xs text-accent-family">
          {error}
        </p>
      )}
    </section>
  );
});

interface QuestStepProps {
  resource: LearningResource;
  index: number;
  isLast: boolean;
  /** The next step to do (first unfinished). */
  current: boolean;
  /** Shown in the canvas preview. */
  selected: boolean;
  reduce: boolean;
  onToggle: (resource: LearningResource, e: MouseEvent<HTMLButtonElement>) => Promise<void>;
  onSelect: (resource: LearningResource, via?: "pointer" | "keyboard") => void;
  onOpenLesson: (resource: LearningResource) => void;
  onRemove: (resource: LearningResource) => void;
}

/**
 * One step on the timeline. Memoized with stable callbacks from the parent, so
 * ticking or selecting one step re-renders that row (and the one losing
 * selection), not the whole path.
 */
const QuestStep = memo(function QuestStep({ resource, index, isLast, current, selected, reduce, onToggle, onSelect, onOpenLesson, onRemove }: QuestStepProps) {
  const done = resource.isCompleted;
  const Icon = RESOURCE_ICON[resource.type];

  return (
    <motion.li
      layout={!reduce}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ type: "spring", bounce: 0.15, duration: 0.5, delay: reduce ? 0 : Math.min(index * 0.05, 0.3) }}
      className="relative flex gap-3.5"
    >
      {/* The path between steps: fills in behind a finished one. */}
      {!isLast && (
        <span aria-hidden className="absolute start-[21px] top-11 -bottom-3 w-px bg-hairline-card">
          <motion.span
            className="absolute inset-0 origin-top bg-accent-learning"
            initial={false}
            animate={{ scaleY: done ? 1 : 0 }}
            transition={{ duration: reduce ? 0 : 0.5, ease: "easeOut" }}
          />
        </span>
      )}

      <button
        type="button"
        onClick={(e) => void onToggle(resource, e)}
        aria-pressed={done}
        aria-label={done ? `סמן את "${resource.title}" כלא הושלם` : `סמן את "${resource.title}" כהושלם`}
        className="focus-ring relative z-10 grid size-11 shrink-0 place-items-center rounded-full"
      >
        {current && !reduce && (
          <motion.span
            aria-hidden
            className="absolute inset-1.5 rounded-full border-2 border-accent-learning"
            animate={{ scale: [1, 1.55], opacity: [0.55, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        <motion.span
          className={cn(
            "grid size-8 place-items-center rounded-full border-2 transition-colors",
            done ? "border-accent-learning bg-accent-learning text-background" : "border-hairline-card bg-surface text-muted"
          )}
          animate={{ scale: done && !reduce ? [1, 1.25, 1] : 1 }}
          transition={{ duration: 0.35 }}
        >
          {done ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: reduce ? 0 : 0.35, ease: "easeOut" }} />
            </svg>
          ) : (
            <span className="text-xs font-semibold tabular-nums">{index + 1}</span>
          )}
        </motion.span>
      </button>

      <div
        className={cn(
          "min-w-0 flex-1 rounded-2xl border transition-colors",
          selected
            ? "border-accent-learning bg-accent-learning/[0.09] shadow-[0_0_0_1px_var(--accent-learning)]"
            : current
              ? "border-accent-learning/40 bg-accent-learning/[0.04]"
              : "border-hairline-card bg-surface hover:border-accent-learning/30"
        )}
      >
        <button
          type="button"
          data-step-select={resource.id}
          onClick={() => onSelect(resource)}
          aria-current={selected ? "step" : undefined}
          className="focus-ring flex min-h-11 w-full items-start gap-2 rounded-2xl px-3.5 pb-1 pt-3 text-start"
        >
          <Icon size={14} className="mt-1 shrink-0 text-accent-learning" aria-hidden />
          <span className={cn("relative min-w-0 flex-1 text-sm font-medium leading-snug transition-colors", done ? "text-muted" : "text-foreground")}>
            {resource.title}
            {/* The strikethrough sweeps in from where the text starts. */}
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-[0.72em] h-px origin-right bg-current"
              initial={false}
              animate={{ scaleX: done ? 1 : 0 }}
              transition={{ duration: reduce ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
            />
          </span>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums transition-colors",
              done ? "bg-accent-learning/15 text-accent-learning" : "bg-[color-mix(in_srgb,var(--gold)_16%,transparent)] text-gold-ink"
            )}
          >
            {done ? "✓ " : "+"}
            {xpForResource(resource.type)} XP
          </span>
        </button>

        <div className="flex flex-wrap items-center gap-1.5 px-3.5 pb-2">
          <span className="text-[10px] text-muted">{RESOURCE_LABEL[resource.type]}</span>
          {resource.type === "youtube" && resource.url && (
            <button
              type="button"
              onClick={() => onSelect(resource)}
              className="focus-ring flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-medium text-accent-learning transition-opacity hover:opacity-80"
            >
              <Play size={11} fill="currentColor" aria-hidden />
              {selected ? "מוצג עכשיו" : "נגן"}
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenLesson(resource)}
            className="focus-ring flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-medium text-accent-learning transition-colors hover:bg-accent-learning/10"
          >
            <GraduationCap size={11} aria-hidden />
            שיעור אמן
          </button>
          {!resource.url && resource.type === "youtube" && (
            // A generated video row is a search term, not a link — say where to look.
            <a
              href={youtubeSearchUrl(resource.title)}
              target="_blank"
              rel="noreferrer"
              className="focus-ring inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs text-foreground transition-colors hover:bg-fill-subtle"
            >
              <Search size={11} className="text-accent-learning" aria-hidden />
              חפש ב-YouTube
            </a>
          )}
          <button
            type="button"
            onClick={() => onRemove(resource)}
            aria-label={`מחק את ${resource.title}`}
            className="focus-ring ms-auto grid size-11 place-items-center rounded-lg text-muted transition-colors hover:text-accent-family"
          >
            <Trash2 size={12} aria-hidden />
          </button>
        </div>
      </div>
    </motion.li>
  );
});
