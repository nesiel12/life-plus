"use client";

import { useState, type MouseEvent } from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  Check,
  ChevronDown,
  FileText,
  Headphones,
  Link2,
  Loader2,
  Sparkles,
  SquarePlay,
  Trash2,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { useApiCall } from "@/hooks/useApiCall";
import { useAtlasStore } from "@/store/useAtlasStore";
import { cn } from "@/lib/utils";
import type { LearningResource, LearningResourceType, LearningTopic, LearningTopicStatus } from "@/types";

const STATUS_LABEL: Record<LearningTopicStatus, string> = {
  planning: "בתכנון",
  active: "פעיל",
  completed: "הושלם",
};

// Clicking the status chip cycles it forward — no separate edit UI needed
// for a three-value field, same "tap to advance" convention as a checkbox,
// just with three states instead of two.
const STATUS_CYCLE: Record<LearningTopicStatus, LearningTopicStatus> = {
  planning: "active",
  active: "completed",
  completed: "planning",
};

const RESOURCE_ICON: Record<LearningResourceType, LucideIcon> = {
  youtube: SquarePlay,
  podcast: Headphones,
  article: FileText,
  equipment: Wrench,
  summary: BookOpen,
};

interface TopicCardProps {
  topic: LearningTopic;
  resources: LearningResource[];
  expanded: boolean;
  onToggleExpanded: () => void;
  delay?: number;
}

export function TopicCard({ topic, resources, expanded, onToggleExpanded, delay = 0 }: TopicCardProps) {
  const updateLearningTopic = useAtlasStore((s) => s.updateLearningTopic);
  const deleteLearningTopic = useAtlasStore((s) => s.deleteLearningTopic);
  const updateLearningResource = useAtlasStore((s) => s.updateLearningResource);
  const deleteLearningResource = useAtlasStore((s) => s.deleteLearningResource);
  const generateLearningPath = useAtlasStore((s) => s.generateLearningPath);

  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const { run: cycleStatus } = useApiCall(updateLearningTopic);
  const { run: removeTopic } = useApiCall(deleteLearningTopic);
  const { error: resourceError, run: toggleResource } = useApiCall(updateLearningResource);
  const { error: removeError, run: removeResource } = useApiCall(deleteLearningResource);
  const { loading: building, error: buildError, run: runBuild } = useApiCall(generateLearningPath);

  function handleStatusClick(e: MouseEvent) {
    e.stopPropagation();
    cycleStatus(topic.id, { status: STATUS_CYCLE[topic.status] }).catch(() => {
      // error surfaced would need its own state; a mis-cycled status is
      // low-stakes enough to just silently no-op on failure here
    });
  }

  function handleDeleteClick(e: MouseEvent) {
    e.stopPropagation();
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    removeTopic(topic.id).catch(() => {
      // error is already captured via useApiCall if the caller wants it
    });
  }

  function handleBuildTrack(e: MouseEvent) {
    e.stopPropagation();
    runBuild(topic.id, topic.title).catch(() => {
      // error is already captured in buildError for display below
    });
  }

  return (
    <GlassCard delay={delay} className="p-4">
      {/* A div, not a button, as the clickable header — it contains its own
          nested interactive status chip (cycles status independently via
          stopPropagation), and a <button> element isn't allowed to contain
          another interactive control per the HTML content model. */}
      <div
        onClick={onToggleExpanded}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleExpanded();
          }
        }}
        className="focus-ring flex w-full cursor-pointer items-center justify-between gap-2 text-start"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{topic.title}</span>
            {topic.category && (
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted">{topic.category}</span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted">{resources.length} משאבים</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            onClick={handleStatusClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleStatusClick(e as unknown as MouseEvent);
              }
            }}
            className="focus-ring rounded-full bg-accent-learning/15 px-2.5 py-1 text-[10px] font-medium text-accent-learning transition-opacity hover:opacity-80"
          >
            {STATUS_LABEL[topic.status]}
          </span>
          <ChevronDown size={16} className={cn("text-muted transition-transform", expanded && "rotate-180")} aria-hidden />
        </div>
      </div>

      {expanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="mt-4 flex flex-col gap-3 overflow-hidden"
        >
          <button
            onClick={handleBuildTrack}
            disabled={building}
            className="focus-ring flex items-center justify-center gap-1.5 rounded-lg bg-accent-learning/20 px-4 py-2 text-sm font-medium text-accent-learning transition-opacity hover:opacity-80 disabled:opacity-60"
          >
            {building ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
            {building ? "בונה מסלול לימוד…" : "בנה לי מסלול"}
          </button>
          {buildError && <p className="text-xs text-accent-family">{buildError}</p>}

          <div className="flex flex-col gap-2">
            {resources.map((resource) => {
              const Icon = RESOURCE_ICON[resource.type];
              return (
                <div key={resource.id} className="flex items-start gap-2 rounded-lg bg-white/5 px-3 py-2">
                  <button
                    onClick={() => toggleResource(resource.id, { isCompleted: !resource.isCompleted }).catch(() => {})}
                    aria-label={
                      resource.isCompleted ? `סמן את "${resource.title}" כלא הושלם` : `סמן את "${resource.title}" כהושלם`
                    }
                    className={cn(
                      "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                      resource.isCompleted
                        ? "border-accent-learning bg-accent-learning/20 text-accent-learning"
                        : "border-glass-border text-transparent"
                    )}
                  >
                    <Check size={10} aria-hidden />
                  </button>
                  <Icon size={14} className="mt-0.5 shrink-0 text-accent-learning" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm", resource.isCompleted ? "text-muted line-through" : "text-foreground")}>
                      {resource.title}
                    </p>
                    {resource.notes && (
                      <p className="mt-0.5 whitespace-pre-line text-xs text-muted">{resource.notes}</p>
                    )}
                    {resource.url && (
                      <a
                        href={resource.url}
                        target="_blank"
                        rel="noreferrer"
                        className="ltr mt-0.5 flex w-fit items-center gap-1 text-xs text-accent-learning hover:underline"
                      >
                        <Link2 size={10} aria-hidden />
                        {resource.url}
                      </a>
                    )}
                  </div>
                  <button
                    onClick={() => removeResource(resource.id).catch(() => {})}
                    aria-label={`מחק את ${resource.title}`}
                    className="mt-0.5 shrink-0 text-muted transition-colors hover:text-accent-family"
                  >
                    <Trash2 size={12} aria-hidden />
                  </button>
                </div>
              );
            })}
            {resources.length === 0 && !building && (
              <p className="text-xs text-muted">אין עדיין משאבים לנושא הזה. לחץ על &quot;בנה לי מסלול&quot; כדי להתחיל.</p>
            )}
            {(resourceError || removeError) && <p className="text-xs text-accent-family">{resourceError ?? removeError}</p>}
          </div>

          <div className="flex justify-end">
            {confirmingDelete ? (
              <div className="flex items-center gap-1.5 text-xs">
                <button
                  onClick={handleDeleteClick}
                  className="focus-ring rounded-lg bg-accent-family/20 px-2 py-0.5 font-medium text-accent-family transition-opacity hover:opacity-80"
                >
                  מחק נושא
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmingDelete(false);
                  }}
                  className="focus-ring text-muted transition-colors hover:text-foreground"
                >
                  ביטול
                </button>
              </div>
            ) : (
              <button
                onClick={handleDeleteClick}
                className="focus-ring flex items-center gap-1 text-xs text-muted transition-colors hover:text-accent-family"
              >
                <Trash2 size={11} aria-hidden />
                מחק נושא
              </button>
            )}
          </div>
        </motion.div>
      )}
    </GlassCard>
  );
}
