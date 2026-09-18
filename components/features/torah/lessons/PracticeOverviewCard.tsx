"use client";

import Link from "next/link";
import { Layers } from "lucide-react";
import { StatsStrip } from "@/components/features/torah/lessons/StatsStrip";
import { usePracticeStats } from "@/components/features/torah/lessons/usePracticeStats";

/** The "לתרגל" entry point on the שיעורים tab: progress at a glance and today's review. */
export function PracticeOverviewCard() {
  const { stats } = usePracticeStats();
  if (stats && stats.totalCards === 0 && stats.xp === 0) return null;

  return (
    <section className="glass-card flex flex-col gap-4 rounded-3xl p-5 sm:p-6" aria-labelledby="practice-overview-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="practice-overview-title" className="text-base font-semibold text-foreground">
            לתרגל
          </h2>
          <p className="text-xs text-muted">הרמה, הרצף והשליטה שלך בחומר</p>
        </div>
        <Link
          href="/areas/torah/practice"
          className="focus-ring flex items-center gap-1.5 rounded-full bg-gold px-4 py-1.5 text-sm font-medium text-white"
        >
          <Layers size={14} aria-hidden />
          {stats?.dueNow ? `חזרה על ${stats.dueNow} כרטיסיות` : "לחזרה המרווחת"}
        </Link>
      </div>
      <StatsStrip stats={stats} />
    </section>
  );
}
