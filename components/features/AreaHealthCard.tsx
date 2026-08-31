"use client";

import Link from "next/link";
import { Target, Brain, Clock, type LucideIcon } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import type { LifeAreaMeta } from "@/lib/lifeAreas";
import { LIFE_AREA_ICONS } from "@/lib/lifeAreaIcons";
import type { AreaInsight, AttentionLevel } from "@/lib/areas/types";

const ATTENTION_CONFIG: Record<AttentionLevel, { label: string; colorClass: string }> = {
  healthy: { label: "בריא", colorClass: "text-accent-health" },
  growing: { label: "בצמיחה", colorClass: "text-accent-knowledge" },
  needs_attention: { label: "זקוק לתשומת לב", colorClass: "text-accent-family" },
};

interface HighlightLine {
  icon: LucideIcon;
  text: string;
}

// One highlight line per card, prioritized — not stacked — to keep the
// dashboard calm rather than a widget board (docs/ATLAS_ARCHITECTURE_
// VISION.md §10): a concrete next action matters more than a behavioral
// observation, which matters more than a bare recent-activity mention.
function pickHighlight(insight: AreaInsight): HighlightLine | null {
  if (insight.recommendedAction) {
    return { icon: Target, text: `הצעד הבא: ${insight.recommendedAction.title}` };
  }
  if (insight.aiInsight) {
    return { icon: Brain, text: insight.aiInsight };
  }
  if (insight.recentHighlight) {
    return { icon: Clock, text: insight.recentHighlight };
  }
  return null;
}

interface AreaHealthCardProps {
  meta: LifeAreaMeta;
  insight?: AreaInsight;
  delay: number;
}

// The Life Dashboard's one reusable card (Areas Experience v2, docs/ATLAS_
// ARCHITECTURE_VISION.md §10) — entirely data-driven, no per-area
// special-casing, so a future area (Finance, or Health once it has real
// data) benefits automatically the moment app/api/areas/insights has
// something real to say about it. Renders instantly from the live store's
// score (unchanged from the previous navigation-card version) and layers
// in the attention badge, stats, and highlight once insights resolve — the
// same progressive-enhancement convention every other Experience Layer
// screen already established.
export function AreaHealthCard({ meta, insight, delay }: AreaHealthCardProps) {
  const Icon = LIFE_AREA_ICONS[meta.key];
  const score = insight?.score ?? 0;
  const attention = insight ? ATTENTION_CONFIG[insight.attentionLevel] : null;
  const highlight = insight ? pickHighlight(insight) : null;
  const HighlightIcon = highlight?.icon;

  return (
    <Link href={`/areas/${meta.slug}`}>
      <GlassCard delay={delay} className="h-full transition-transform hover:-translate-y-0.5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="flex size-10 items-center justify-center rounded-full"
              style={{ backgroundColor: `color-mix(in srgb, var(${meta.colorVar}) 20%, transparent)` }}
            >
              <Icon size={18} style={{ color: `var(${meta.colorVar})` }} aria-hidden />
            </div>
            <span className="font-medium text-foreground">{meta.pageTitle}</span>
          </div>
          {attention ? (
            <span className={`text-xs font-medium ${attention.colorClass}`}>{attention.label}</span>
          ) : (
            <span className="h-3 w-14 animate-pulse rounded-full bg-white/5" aria-hidden />
          )}
        </div>

        <div className="mb-3 flex items-center justify-between text-sm">
          <span className="text-muted">מדד התחום</span>
          <span className="text-foreground">{score}%</span>
        </div>
        <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
          <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: `var(${meta.colorVar})` }} />
        </div>

        {insight ? (
          <p className="mb-2 text-xs text-muted">
            {insight.activeGoalsCount > 0 && `${insight.activeGoalsCount} יעדים פעילים`}
            {insight.activeGoalsCount > 0 && insight.lastActivityDaysAgo !== null ? " · " : ""}
            {insight.lastActivityDaysAgo === null
              ? insight.activeGoalsCount === 0
                ? "אין עדיין פעילות"
                : ""
              : insight.lastActivityDaysAgo === 0
                ? "פעילות היום"
                : `לפני ${insight.lastActivityDaysAgo} ימים`}
          </p>
        ) : (
          <div className="mb-2 h-3 w-32 animate-pulse rounded-full bg-white/5" aria-hidden />
        )}

        {highlight && HighlightIcon && (
          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-foreground/70">
            <HighlightIcon size={12} className="mt-0.5 shrink-0 text-muted" aria-hidden />
            {highlight.text}
          </p>
        )}
      </GlassCard>
    </Link>
  );
}
