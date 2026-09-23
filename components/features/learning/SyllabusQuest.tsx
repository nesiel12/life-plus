"use client";

import { useMemo, useState, type MouseEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { GraduationCap, Loader2, Play, Search, Sparkles, Trash2 } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { ResourceLauncher } from "@/components/features/learning/ResourceLauncher";
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
  /** The resource whose video is showing in the cinema, if any. */
  playingId: string | null;
  onPlayVideo: (resource: LearningResource) => void;
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
export function SyllabusQuest({ topic, resources, playingId, onPlayVideo, onOpenLesson }: SyllabusQuestProps) {
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

  async function toggle(resource: LearningResource, e: MouseEvent<HTMLButtonElement>) {
    setError(null);
    try {
      await complete(resource, !resource.isCompleted, originOf(e.currentTarget));
    } catch {
      setError("העדכון לא נשמר.");
    }
  }

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

      <ol className="relative flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {resources.map((resource, index) => {
            const done = resource.isCompleted;
            const current = resource.id === currentId;
            const Icon = RESOURCE_ICON[resource.type];
            const isLast = index === resources.length - 1;
            const isVideo = resource.type === "youtube" && Boolean(resource.url);

            return (
              <motion.li
                key={resource.id}
                layout={!reduce}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 24 }}
                transition={{ type: "spring", bounce: 0.15, duration: 0.5, delay: reduce ? 0 : Math.min(index * 0.05, 0.3) }}
                className="relative flex gap-3.5"
              >
                {/* The path between steps: fills in behind a finished one. */}
                {!isLast && (
                  <span aria-hidden className="absolute start-[15px] top-8 -bottom-3 w-px bg-hairline-card">
                    <motion.span
                      className="absolute inset-0 origin-top bg-accent-learning"
                      initial={false}
                      animate={{ scaleY: done ? 1 : 0 }}
                      transition={{ duration: reduce ? 0 : 0.5, ease: "easeOut" }}
                    />
                  </span>
                )}

                <button
                  onClick={(e) => void toggle(resource, e)}
                  aria-pressed={done}
                  aria-label={done ? `סמן את "${resource.title}" כלא הושלם` : `סמן את "${resource.title}" כהושלם`}
                  className="focus-ring relative z-10 mt-0.5 grid size-8 shrink-0 place-items-center rounded-full"
                >
                  {current && !reduce && (
                    <motion.span
                      aria-hidden
                      className="absolute inset-0 rounded-full border-2 border-accent-learning"
                      animate={{ scale: [1, 1.55], opacity: [0.55, 0] }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                    />
                  )}
                  <motion.span
                    className={cn(
                      "grid size-8 place-items-center rounded-full border-2 transition-colors",
                      done ? "border-accent-learning bg-accent-learning text-background" : "border-hairline-card bg-surface text-muted"
                    )}
                    animate={{ scale: done ? [1, 1.25, 1] : 1 }}
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

                <div className={cn("min-w-0 flex-1 rounded-2xl border px-3.5 py-3 transition-colors", current ? "border-accent-learning/40 bg-accent-learning/[0.06]" : "border-hairline-card bg-surface")}>
                  <div className="flex items-start gap-2">
                    <Icon size={14} className="mt-1 shrink-0 text-accent-learning" aria-hidden />
                    <p className={cn("relative min-w-0 flex-1 text-sm font-medium leading-snug transition-colors", done ? "text-muted" : "text-foreground")}>
                      {resource.title}
                      {/* The strikethrough sweeps in from where the text starts. */}
                      <motion.span
                        aria-hidden
                        className="pointer-events-none absolute inset-x-0 top-[0.72em] h-px origin-right bg-current"
                        initial={false}
                        animate={{ scaleX: done ? 1 : 0 }}
                        transition={{ duration: reduce ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </p>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums transition-colors",
                        done ? "bg-accent-learning/15 text-accent-learning" : "bg-[color-mix(in_srgb,var(--gold)_16%,transparent)] text-gold-ink"
                      )}
                    >
                      {done ? "✓ " : "+"}
                      {xpForResource(resource.type)} XP
                    </span>
                  </div>

                  {resource.notes && <p className="mt-1 whitespace-pre-line text-xs text-muted">{resource.notes}</p>}

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-[10px] text-muted">{RESOURCE_LABEL[resource.type]}</span>
                    {isVideo && (
                      <button
                        onClick={() => onPlayVideo(resource)}
                        className="focus-ring flex items-center gap-1 rounded-lg bg-accent-learning/15 px-2.5 py-1 text-xs font-medium text-accent-learning transition-opacity hover:opacity-80"
                      >
                        <Play size={11} fill="currentColor" aria-hidden />
                        {playingId === resource.id ? "מנגן עכשיו" : "נגן"}
                      </button>
                    )}
                    {!isVideo && resource.url && <ResourceLauncher url={resource.url} title={resource.title} />}
                    <button
                      onClick={() => onOpenLesson(resource)}
                      className="focus-ring flex items-center gap-1 rounded-lg border border-accent-learning/30 px-2.5 py-1 text-xs font-medium text-accent-learning transition-colors hover:bg-accent-learning/10"
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
                        className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-hairline-card px-2 py-1 text-xs text-foreground transition-colors hover:bg-fill-subtle"
                      >
                        <Search size={11} className="text-accent-learning" aria-hidden />
                        חפש ב-YouTube
                      </a>
                    )}
                    <button
                      onClick={() => removeResource(resource.id).catch(() => setError("המחיקה לא נשמרה."))}
                      aria-label={`מחק את ${resource.title}`}
                      className="focus-ring ms-auto text-muted transition-colors hover:text-accent-family"
                    >
                      <Trash2 size={12} aria-hidden />
                    </button>
                  </div>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>

      {error && (
        <p role="alert" className="text-xs text-accent-family">
          {error}
        </p>
      )}
    </section>
  );
}
