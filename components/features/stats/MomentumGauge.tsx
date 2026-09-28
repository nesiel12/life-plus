"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { ProgressRing } from "@/components/ui/ProgressRing";
import type { MomentumScoreData } from "@/types/gamification";

const TIER_COLOR: Record<MomentumScoreData["tier"], string> = {
  idle: "var(--muted)",
  starting: "var(--accent-time)",
  building: "var(--accent-learning)",
  strong: "var(--accent-health)",
  onFire: "var(--accent-fitness)",
};

const TIER_LABEL: Record<MomentumScoreData["tier"], string> = {
  idle: "עוד לא זזתם היום",
  starting: "מתחילים לזוז",
  building: "בונים תאוצה",
  strong: "תאוצה חזקה",
  onFire: "על האש! 🔥",
};

interface MomentumGaugeProps {
  data: MomentumScoreData;
}

/**
 * The 0-100% meter: today's tasks (weighted by priority) plus today's habit
 * check-ins, computed by lib/gamification/momentum.ts. This component only
 * renders the number it's handed — it never asks "should this count",
 * because that question is already answered, deterministically, server-side.
 */
export function MomentumGauge({ data }: MomentumGaugeProps) {
  const { score, tier, tasksCompleted, tasksTotal, habitsCompleted, habitsTotal } = data;
  const color = TIER_COLOR[tier];

  return (
    <GlassCard className="flex flex-col items-center gap-3 text-center">
      <h3 className="self-start text-sm font-semibold text-foreground">מד המומנטום היומי</h3>

      <ProgressRing value={score / 100} size={140} stroke={12} color={color} label={`מומנטום יומי: ${score} אחוז`}>
        <span className="ltr text-3xl font-bold tabular-nums text-foreground">{score}%</span>
      </ProgressRing>

      <p className="text-sm font-medium" style={{ color }}>
        {TIER_LABEL[tier]}
      </p>

      <dl className="grid w-full grid-cols-2 gap-2 border-t border-hairline-card pt-3 text-xs text-muted">
        <div className="flex flex-col items-center gap-0.5">
          <dt>משימות</dt>
          <dd className="ltr tabular-nums text-sm font-semibold text-foreground">
            {tasksCompleted}/{tasksTotal}
          </dd>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <dt>הרגלים</dt>
          <dd className="ltr tabular-nums text-sm font-semibold text-foreground">
            {habitsCompleted}/{habitsTotal}
          </dd>
        </div>
      </dl>
    </GlassCard>
  );
}
