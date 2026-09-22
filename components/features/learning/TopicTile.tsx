"use client";

import { useState, type KeyboardEvent } from "react";
import { motion, type Variants } from "framer-motion";
import { ChevronLeft, Sparkles } from "lucide-react";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { TiltCard } from "@/components/ui/TiltCard";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { GlowBorder } from "@/components/features/learning/lab/GlowBorder";
import { RESOURCE_ICON, STATUS_LABEL } from "@/components/features/learning/lab/labels";
import { useLabReducedMotion } from "@/components/features/learning/lab/useLabMotion";
import { topicProgress, topicXp } from "@/lib/learning/xp";
import { cn } from "@/lib/utils";
import type { LearningResource, LearningTopic } from "@/types";

/** How a tile stands in the shuffle: normal, the one it landed on, or everyone else. */
export type Spotlight = "none" | "lit" | "dimmed";

interface TopicTileProps {
  topic: LearningTopic;
  resources: readonly LearningResource[];
  variant: "card" | "row";
  spotlight?: Spotlight;
  /** A wider card that has room to preview the syllabus. */
  wide?: boolean;
  onOpen: (topicId: string) => void;
}

/** Cascade in one after another, with a little spring — the page's entrance. */
export const TILE_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 26, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", bounce: 0.2, duration: 0.65 } },
};

const MAX_ICONS = 4;
const MAX_PREVIEW = 3;

/**
 * One topic, as a card or a row.
 *
 * Both share `layoutId="topic-<id>"` with the graph node and the expanded
 * canvas, which is what lets a card glide into a row, into a node, and open into
 * the canvas as one continuous object rather than three unrelated screens.
 *
 * The card leans in 3D toward the pointer (TiltCard), scales up slightly, and a
 * light circles its border while hovered — all transforms and opacity. The ring
 * and the percentage animate from zero on first sight and to the new value on
 * every change.
 */
export function TopicTile({ topic, resources, variant, spotlight = "none", wide = false, onOpen }: TopicTileProps) {
  const reduce = useLabReducedMotion();
  const [hovered, setHovered] = useState(false);

  const progress = topicProgress(resources);
  const percent = Math.round(progress.fraction * 100);
  const xp = topicXp(resources);
  const lit = spotlight === "lit";

  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(topic.id);
    }
  }

  const ring = (size: number, stroke: number) => (
    <ProgressRing
      value={progress.fraction}
      size={size}
      stroke={stroke}
      color="var(--accent-learning)"
      label={`${progress.done} מתוך ${progress.total} משאבים הושלמו`}
    >
      <span className="ltr text-[0.62rem] font-semibold tabular-nums text-foreground/85">
        <NumberTicker value={percent} />%
      </span>
    </ProgressRing>
  );

  const icons = [...new Set(resources.map((r) => r.type))].slice(0, MAX_ICONS);

  const content =
    variant === "row" ? (
      <div className="flex items-center gap-3 px-4 py-3">
        {ring(40, 4)}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{topic.title}</p>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-fill-subtle">
            <motion.div
              className="h-full origin-right rounded-full bg-accent-learning"
              initial={false}
              animate={{ scaleX: progress.fraction }}
              transition={{ type: "spring", bounce: 0.1, duration: 0.7 }}
            />
          </div>
        </div>
        {topic.category && <span className="hidden rounded-full bg-fill-subtle px-2 py-0.5 text-[10px] text-muted sm:inline">{topic.category}</span>}
        <span className="hidden text-xs tabular-nums text-muted sm:inline">
          {progress.done}/{progress.total}
        </span>
        <span className="rounded-full bg-accent-learning/15 px-2.5 py-1 text-[10px] font-medium text-accent-learning">{STATUS_LABEL[topic.status]}</span>
        <ChevronLeft size={16} className="text-muted" aria-hidden />
      </div>
    ) : (
      <div className="flex h-full flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          {ring(wide ? 60 : 52, 5)}
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-[0.95rem] font-semibold leading-snug text-foreground">{topic.title}</h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {topic.category && <span className="rounded-full bg-fill-subtle px-2 py-0.5 text-[10px] text-muted">{topic.category}</span>}
              <span className="rounded-full bg-accent-learning/15 px-2 py-0.5 text-[10px] font-medium text-accent-learning">{STATUS_LABEL[topic.status]}</span>
            </div>
          </div>
        </div>

        {wide && resources.length > 0 && (
          <ul className="flex flex-col gap-1 text-xs text-muted">
            {resources.slice(0, MAX_PREVIEW).map((r) => (
              <li key={r.id} className={cn("truncate", r.isCompleted && "line-through opacity-60")}>
                • {r.title}
              </li>
            ))}
            {resources.length > MAX_PREVIEW && <li>ועוד {resources.length - MAX_PREVIEW}…</li>}
          </ul>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1.5 text-accent-learning">
            {icons.map((type) => {
              const Icon = RESOURCE_ICON[type];
              return <Icon key={type} size={14} aria-hidden />;
            })}
            <span className="ms-1 text-xs tabular-nums text-muted">{resources.length} משאבים</span>
          </div>
          {xp > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--gold)_18%,transparent)] px-2 py-0.5 text-[10px] font-semibold text-gold-ink">
              <Sparkles size={10} aria-hidden />+{xp} XP
            </span>
          )}
        </div>
      </div>
    );

  return (
    <motion.div
      layoutId={`topic-${topic.id}`}
      variants={TILE_VARIANTS}
      initial="hidden"
      // A card that is a different size in another view morphs there, on a spring.
      transition={{ layout: { type: "spring", bounce: 0.12, duration: 0.55 } }}
      className={cn("relative min-w-0", wide && variant === "card" && "sm:col-span-2")}
      style={{ borderRadius: 16 }}
    >
      <motion.div
        role="button"
        tabIndex={0}
        aria-label={`${topic.title} — ${percent}% הושלם. פתח את הנושא`}
        onClick={() => onOpen(topic.id)}
        onKeyDown={onKey}
        onHoverStart={() => setHovered(true)}
        onHoverEnd={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        animate={{ opacity: spotlight === "dimmed" ? 0.38 : 1, scale: lit ? 1.05 : 1 }}
        whileHover={reduce ? undefined : { scale: variant === "card" ? 1.02 : 1.01 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        className="focus-ring h-full cursor-pointer rounded-2xl"
      >
        <GlowBorder active={hovered || lit} radius="rounded-2xl" className="h-full">
          {variant === "card" ? (
            <TiltCard intensity={8} className="h-full rounded-2xl">
              {content}
            </TiltCard>
          ) : (
            content
          )}
        </GlowBorder>
      </motion.div>
    </motion.div>
  );
}
