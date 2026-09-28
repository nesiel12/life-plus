"use client";

import dynamic from "next/dynamic";
import { retryImport } from "@/lib/dynamicImport";
import { StreakCard } from "@/components/features/stats/StreakCard";
import type { MomentumDashboardData } from "@/types/gamification";

// The three heaviest cards (framer-motion rings, a 53-week grid of cells,
// an 8-tile achievement shelf) split into their own chunks so the page's
// initial JS is just the layout + StreakCard — the same "split out the
// heaviest, least-needed-first part" reasoning TopicsMapTab.tsx and
// StepPreview.tsx already use for their own dynamic imports. ssr:false
// because there's nothing to gain server-rendering a chart that only
// becomes interactive client-side; retryImport because a transient
// chunk-load failure shouldn't fall through to the page's error boundary
// (see lib/dynamicImport.ts). Every skeleton is sized to roughly its real
// component's height so streaming in doesn't jump the layout.
const HeatmapGrid = dynamic(
  () => retryImport(() => import("@/components/features/stats/HeatmapGrid").then((m) => m.HeatmapGrid)),
  { ssr: false, loading: () => <div className="glass-card h-40 animate-pulse rounded-2xl bg-fill-subtle/40" aria-hidden /> }
);

const MomentumGauge = dynamic(
  () => retryImport(() => import("@/components/features/stats/MomentumGauge").then((m) => m.MomentumGauge)),
  { ssr: false, loading: () => <div className="glass-card h-72 animate-pulse rounded-2xl bg-fill-subtle/40" aria-hidden /> }
);

const BadgesGrid = dynamic(
  () => retryImport(() => import("@/components/features/stats/BadgesGrid").then((m) => m.BadgesGrid)),
  { ssr: false, loading: () => <div className="glass-card h-56 animate-pulse rounded-2xl bg-fill-subtle/40" aria-hidden /> }
);

interface MomentumDashboardProps {
  data: MomentumDashboardData;
}

/**
 * The Statistics & Analytics Center — the four Momentum Dashboard widgets
 * assembled on one screen. Every number here already arrived computed
 * (app/stats/page.tsx calls the server action once); this component is pure
 * layout. StreakCard stays a normal import — it's the lightest card and the
 * first thing above the fold, so there's nothing to gain deferring it.
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
