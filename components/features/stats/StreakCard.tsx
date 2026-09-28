"use client";

import { Flame, Snowflake, Trophy } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import type { MomentumStreakData } from "@/types/gamification";

interface StreakCardProps {
  data: MomentumStreakData;
}

/**
 * The Streak Engine's UI surface: current run, personal best, and how many
 * Streak Freezes are banked. The freeze count is display-only here — the
 * decision to actually spend one on a missed day happens server-side
 * (lib/gamification/streaks.ts's decideStreakFreezeConsumption, applied in
 * statsService.ts), so what's shown is always already the post-protection
 * number, not something this component negotiates.
 */
export function StreakCard({ data }: StreakCardProps) {
  const { currentStreak, longestStreak, activeDays, freezesAvailable, freezesEarned } = data;

  return (
    <GlassCard className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-foreground">רצף התמדה</h3>

      <div className="flex items-center gap-3">
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--accent-fitness)_16%,transparent)] text-accent-fitness">
          <Flame size={26} aria-hidden />
        </span>
        <div>
          <p className="ltr text-3xl font-bold tabular-nums text-foreground">{currentStreak}</p>
          <p className="text-xs text-muted">ימי רצף נוכחי</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-hairline-card pt-3 text-xs text-muted">
        <div className="flex items-center gap-2">
          <Trophy size={16} className="shrink-0 text-accent-faith" aria-hidden />
          <div>
            <p className="ltr tabular-nums text-sm font-semibold text-foreground">{longestStreak}</p>
            <p>שיא אישי</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Snowflake size={16} className="shrink-0 text-accent-knowledge" aria-hidden />
          <div>
            <p className="ltr tabular-nums text-sm font-semibold text-foreground">{freezesAvailable}</p>
            <p>מגני רצף זמינים</p>
          </div>
        </div>
      </div>

      <p className="text-[0.7rem] text-muted">
        <span className="ltr tabular-nums">{activeDays}</span> ימי פעילות בסך הכל ·{" "}
        <span className="ltr tabular-nums">{freezesEarned}</span> מגני רצף הורווחו עד כה
      </p>
    </GlassCard>
  );
}
