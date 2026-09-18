"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Flame, Layers, Star, Trophy } from "lucide-react";
import { MASTERY_LABELS, type MasteryTier } from "@/lib/torah/srs";
import type { PracticeStats } from "@/lib/torah/practiceStats";
import { cn } from "@/lib/utils";

const TIER_COLORS: Record<MasteryTier, string> = {
  new: "bg-fill-strong",
  learning: "bg-accent-knowledge/50",
  young: "bg-accent-learning/70",
  mature: "bg-gold",
  mastered: "bg-accent-health",
};

const TIERS: MasteryTier[] = ["new", "learning", "young", "mature", "mastered"];

/**
 * The progress strip for "לתרגל": level with an XP ring, the practice streak,
 * cards due, and the deck's mastery distribution.
 *
 * Everything here is computed from history (lib/torah/practiceStats.ts), so it
 * cannot drift from what the user actually did.
 */
export function StatsStrip({ stats, variant = "full" }: { stats: PracticeStats | null; variant?: "full" | "compact" }) {
  const reduceMotion = useReducedMotion();

  if (!stats) {
    return <div className={cn("animate-pulse rounded-2xl bg-fill", variant === "full" ? "h-28" : "h-14")} aria-hidden />;
  }

  const ring = 2 * Math.PI * 22;
  const tierTotal = TIERS.reduce((sum, tier) => sum + stats.tiers[tier], 0);

  return (
    <div className={cn("grid gap-3", variant === "full" ? "2xl:grid-cols-[auto_minmax(18rem,1fr)]" : "")}>
      <div className="flex flex-wrap items-center gap-3">
        {/* Level ring */}
        <div className="flex items-center gap-3 rounded-2xl border border-hairline-card bg-surface px-3 py-2.5">
          <div className="relative size-14">
            <svg viewBox="0 0 52 52" className="size-14 -rotate-90" aria-hidden>
              <circle cx="26" cy="26" r="22" fill="none" stroke="var(--fill)" strokeWidth="5" />
              <motion.circle
                cx="26"
                cy="26"
                r="22"
                fill="none"
                stroke="var(--gold)"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={ring}
                initial={false}
                animate={{ strokeDashoffset: ring * (1 - stats.levelProgress) }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.8, ease: "easeOut" }}
              />
            </svg>
            <span className="absolute inset-0 grid place-items-center text-lg font-bold text-foreground">{stats.level}</span>
          </div>
          <div>
            <p className="flex items-center gap-1 text-xs font-medium text-gold-ink">
              <Trophy size={12} aria-hidden />
              רמה {stats.level}
            </p>
            <p className="text-sm font-semibold text-foreground">
              <span className="ltr tabular-nums">{stats.xp}</span> XP
            </p>
            <p className="text-[0.65rem] text-muted">
              עוד <span className="ltr tabular-nums">{stats.xpToNextLevel}</span> לרמה הבאה
            </p>
          </div>
        </div>

        <Metric
          icon={Flame}
          tone={stats.streakDays > 0 ? "text-accent-fitness" : "text-muted"}
          value={stats.streakDays}
          label={stats.streakDays === 1 ? "יום ברצף" : "ימים ברצף"}
          hint={stats.practicedToday ? "תרגלת היום" : stats.streakDays > 0 ? "תרגל היום כדי לשמור על הרצף" : undefined}
        />
        <Metric icon={Layers} tone="text-accent-knowledge" value={stats.dueNow} label="כרטיסיות לחזרה" />
        {variant === "full" && stats.averageScore !== null && (
          <Metric icon={Star} tone="text-gold-ink" value={stats.averageScore} label="ציון ממוצע" />
        )}
      </div>

      {variant === "full" && tierTotal > 0 && (
        <div className="flex flex-col justify-center gap-2 rounded-2xl border border-hairline-card bg-surface px-4 py-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">שליטה בחומר</span>
            <span className="ltr tabular-nums text-muted">{Math.round(stats.deckProgress * 100)}%</span>
          </div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-fill" role="img" aria-label="התפלגות רמות שליטה">
            {TIERS.map((tier) =>
              stats.tiers[tier] ? (
                <div key={tier} className={TIER_COLORS[tier]} style={{ width: `${(stats.tiers[tier] / tierTotal) * 100}%` }} />
              ) : null
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[0.65rem] text-muted">
            {TIERS.filter((tier) => stats.tiers[tier]).map((tier) => (
              <span key={tier} className="flex items-center gap-1">
                <span className={cn("size-2 rounded-full", TIER_COLORS[tier])} aria-hidden />
                {MASTERY_LABELS[tier]} <span className="ltr tabular-nums">{stats.tiers[tier]}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({
  icon: Icon,
  tone,
  value,
  label,
  hint,
}: {
  icon: typeof Flame;
  tone: string;
  value: number;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-hairline-card bg-surface px-3 py-2.5">
      <Icon size={20} className={tone} aria-hidden />
      <div>
        <p className="text-base font-semibold leading-tight text-foreground">
          <span className="ltr tabular-nums">{value}</span>
        </p>
        <p className="text-[0.65rem] text-muted">{label}</p>
        {hint && <p className="text-[0.6rem] text-gold-ink">{hint}</p>}
      </div>
    </div>
  );
}
