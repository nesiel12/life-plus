"use client";

import { motion } from "framer-motion";
import { Flame, Sparkles, Check, X } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import type { LearningInsights } from "@/lib/learning/types";

interface LearningInsightsHeroProps {
  insights: LearningInsights | null;
  onAcceptNextReview: (entryId: string, recommendationEventId: string) => void;
  onDismissNextReview: (recommendationEventId: string) => void;
}

// Learning Experience v2's "what matters right now" surface for the Torah/
// Learning workspace — the same role AIBriefing plays on Today, built from
// the same progressive-enhancement + quiet-empty-state conventions: a
// pulsing skeleton while app/api/torah/insights hasn't resolved, and
// nothing at all once it has if there's genuinely no streak, no confident
// pattern, and no next review to suggest.
export function LearningInsightsHero({ insights, onAcceptNextReview, onDismissNextReview }: LearningInsightsHeroProps) {
  if (insights === null) {
    return (
      <GlassCard delay={0}>
        <div className="flex flex-col gap-2.5" aria-hidden>
          {[70, 50].map((width, i) => (
            <div key={i} className="h-4 animate-pulse rounded-full bg-white/5" style={{ width: `${width}%` }} />
          ))}
        </div>
      </GlassCard>
    );
  }

  const hasProgress = insights.streakDays > 0 || insights.topicFocus || insights.cadencePerWeek;
  if (!hasProgress && !insights.nextReview) return null;

  return (
    <GlassCard delay={0}>
      {hasProgress && (
        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
          {insights.streakDays > 0 && (
            <span className="flex items-center gap-1 text-foreground">
              <Flame size={15} className="text-accent-family" aria-hidden />
              רצף למידה: {insights.streakDays} ימים
            </span>
          )}
          {(insights.topicFocus || insights.cadencePerWeek) && (
            <span className="text-xs text-muted">
              {insights.topicFocus && `מתמקד לאחרונה ב"${insights.topicFocus}"`}
              {insights.topicFocus && insights.cadencePerWeek ? " · " : ""}
              {insights.cadencePerWeek && `כ-${insights.cadencePerWeek.toFixed(1)} שיעורים בשבוע`}
            </span>
          )}
        </div>
      )}

      {insights.nextReview && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="rounded-xl bg-white/5 p-3"
        >
          <p className="mb-1 flex items-center gap-1 text-xs text-muted">
            <Sparkles size={12} aria-hidden />
            כדאי לחזור על
          </p>
          <p className="mb-1 text-sm text-foreground">{insights.nextReview.topic}</p>
          <p className="mb-2 text-xs leading-relaxed text-foreground/70">{insights.nextReview.rationale}</p>

          <div className="mb-2 flex items-center gap-2">
            <span className="shrink-0 text-xs text-muted">רמת התאמה</span>
            <div
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5"
              role="progressbar"
              aria-valuenow={Math.round(insights.nextReview.confidence * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="רמת התאמה של הצעת החזרה"
            >
              <div
                className="h-full rounded-full bg-accent-faith"
                style={{ width: `${Math.round(insights.nextReview.confidence * 100)}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => onAcceptNextReview(insights.nextReview!.entryId, insights.nextReview!.recommendationEventId)}
              className="focus-ring flex items-center gap-1 rounded-lg bg-accent-health/15 px-3 py-1.5 text-xs font-medium text-accent-health transition-opacity hover:opacity-80"
            >
              <Check size={12} aria-hidden />
              סימון כנלמד
            </button>
            <button
              onClick={() => onDismissNextReview(insights.nextReview!.recommendationEventId)}
              className="focus-ring flex items-center gap-1 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-muted transition-opacity hover:text-foreground"
            >
              <X size={12} aria-hidden />
              לא עכשיו
            </button>
          </div>
        </motion.div>
      )}
    </GlassCard>
  );
}
