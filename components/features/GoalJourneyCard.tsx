"use client";

import { motion } from "framer-motion";
import {
  Award,
  TrendingUp,
  AlertCircle,
  Sparkles,
  Trash2,
  Link2,
  Check,
  X,
  type LucideIcon,
} from "lucide-react";
import { categoryLabel } from "@/store/useAtlasStore";
import { GlassCard } from "@/components/ui/GlassCard";
import { LIFE_AREAS } from "@/lib/lifeAreas";
import { cn } from "@/lib/utils";
import type { Goal } from "@/types";
import type { GoalInsight, GoalStage } from "@/lib/goals/types";

const STAGE_CONFIG: Record<GoalStage, { label: string; icon: LucideIcon; colorClass: string }> = {
  starting: { label: "מתחיל", icon: Sparkles, colorClass: "text-muted" },
  in_progress: { label: "בתהליך", icon: TrendingUp, colorClass: "text-accent-knowledge" },
  stuck: { label: "תקוע", icon: AlertCircle, colorClass: "text-accent-family" },
  completed: { label: "הושלם", icon: Award, colorClass: "text-accent-health" },
};

interface GoalJourneyCardProps {
  goal: Goal;
  // undefined while app/api/goals/insights hasn't resolved yet — the card
  // still renders immediately from the live store (title, progress,
  // milestone checklist); only the "smart" additions wait a beat, the same
  // progressive-enhancement convention AIBriefing already established.
  insight: GoalInsight | undefined;
  delay: number;
  onToggleMilestone: (milestoneId: string) => void;
  onRemove: () => void;
  onAcceptNextAction: (milestoneId: string, recommendationEventId: string) => void;
  onDismissNextAction: (recommendationEventId: string) => void;
}

export function GoalJourneyCard({
  goal,
  insight,
  delay,
  onToggleMilestone,
  onRemove,
  onAcceptNextAction,
  onDismissNextAction,
}: GoalJourneyCardProps) {
  const meta = LIFE_AREAS[goal.category];
  const doneCount = goal.milestones.filter((m) => m.done).length;
  const totalCount = goal.milestones.length;
  const progress = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;

  const stageConfig = insight ? STAGE_CONFIG[insight.stage] : null;
  const StageIcon = stageConfig?.icon;

  return (
    <GlassCard delay={delay} className="p-4">
      <div className="mb-2 flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">{goal.title}</p>
          <span className="text-xs text-muted">{categoryLabel(goal.category)}</span>
        </div>
        <button
          onClick={onRemove}
          className="focus-ring rounded-lg p-1.5 text-muted transition-colors hover:bg-white/5 hover:text-foreground"
          aria-label="מחק יעד"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {stageConfig && StageIcon ? (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
          <StageIcon size={13} className={stageConfig.colorClass} aria-hidden />
          <span className={stageConfig.colorClass}>{stageConfig.label}</span>
          <span className="text-muted">
            · {doneCount} מתוך {totalCount} אבני דרך
          </span>
          {insight?.estimatedDaysRemaining != null && insight.stage !== "completed" && (
            <span className="text-muted">· צפוי בעוד כ-{insight.estimatedDaysRemaining} ימים</span>
          )}
        </div>
      ) : (
        <div className="mb-2 h-3.5 w-40 animate-pulse rounded-full bg-white/5" aria-hidden />
      )}

      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full transition-[width]"
          style={{ width: `${progress}%`, backgroundColor: `var(${meta.colorVar})` }}
        />
      </div>

      {!insight && (
        <div className="mb-3 h-20 w-full animate-pulse rounded-xl bg-white/5" aria-hidden />
      )}

      {insight?.nextAction && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="mb-3 rounded-xl bg-white/5 p-3"
        >
          <p className="mb-1 flex items-center gap-1 text-xs text-muted">
            <Sparkles size={12} aria-hidden />
            הצעד הבא
          </p>
          <p className="mb-1 text-sm text-foreground">{insight.nextAction.title}</p>
          <p className="mb-2 text-xs leading-relaxed text-foreground/70">{insight.nextAction.rationale}</p>

          <div className="mb-2 flex items-center gap-2">
            <span className="shrink-0 text-xs text-muted">רמת התאמה</span>
            <div
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5"
              role="progressbar"
              aria-valuenow={Math.round(insight.nextAction.confidence * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="רמת התאמה של הצעד הבא"
            >
              <div
                className="h-full rounded-full bg-accent-faith"
                style={{ width: `${Math.round(insight.nextAction.confidence * 100)}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => onAcceptNextAction(insight.nextAction!.milestoneId, insight.nextAction!.recommendationEventId)}
              className="focus-ring flex items-center gap-1 rounded-lg bg-accent-health/15 px-3 py-1.5 text-xs font-medium text-accent-health transition-opacity hover:opacity-80"
            >
              <Check size={12} aria-hidden />
              סימון כהושלם
            </button>
            <button
              onClick={() => onDismissNextAction(insight.nextAction!.recommendationEventId)}
              className="focus-ring flex items-center gap-1 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-muted transition-opacity hover:text-foreground"
            >
              <X size={12} aria-hidden />
              לא עכשיו
            </button>
          </div>
        </motion.div>
      )}

      {insight && insight.relatedMemory.length > 0 && (
        <div className="mb-3 rounded-lg bg-white/5 p-3">
          <p className="mb-1 flex items-center gap-1 text-xs text-muted">
            <Link2 size={12} aria-hidden />
            קשור להיסטוריה שלך
          </p>
          {insight.relatedMemory.map((line, i) => (
            <p key={i} className="text-xs leading-relaxed text-foreground/70">
              {line}
            </p>
          ))}
        </div>
      )}

      <ul className="flex flex-col gap-1.5">
        {goal.milestones.map((m) => (
          <li key={m.id} className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={m.done}
              onChange={() => onToggleMilestone(m.id)}
              aria-label={m.title}
              className="accent-current"
            />
            <span className={cn(m.done && "text-muted line-through")}>{m.title}</span>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}
