"use client";

import { HeatmapGrid } from "@/components/features/stats/HeatmapGrid";
import { MomentumGauge } from "@/components/features/stats/MomentumGauge";
import { StreakCard } from "@/components/features/stats/StreakCard";
import { BadgesGrid } from "@/components/features/stats/BadgesGrid";
import type { MomentumDashboardData } from "@/types/gamification";

interface MomentumDashboardProps {
  data: MomentumDashboardData;
}

/**
 * The Statistics & Analytics Center — the four Momentum Dashboard widgets
 * assembled on one screen. Every number here already arrived computed
 * (app/stats/page.tsx calls the server action once); this component is pure
 * layout.
 */
export function MomentumDashboard({ data }: MomentumDashboardProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <StreakCard data={data.streak} />
        <MomentumGauge data={data.momentum} />
      </div>
      <HeatmapGrid counts={data.heatmap.counts} peak={data.heatmap.peak} />
      <BadgesGrid badges={data.badges} />
    </div>
  );
}
