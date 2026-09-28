"use client";

import { CalendarCheck, Crown, Flame, Rocket, Sparkles, Sunrise, Swords, Trophy, type LucideIcon } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";
import type { BadgeIcon } from "@/lib/gamification/badges";
import type { MomentumBadgeView } from "@/types/gamification";

const ICONS: Record<BadgeIcon, LucideIcon> = {
  Sunrise,
  Flame,
  CalendarCheck,
  Crown,
  Trophy,
  Swords,
  Sparkles,
  Rocket,
};

interface BadgesGridProps {
  badges: readonly MomentumBadgeView[];
}

/**
 * The achievement shelf. Every tile's earned/locked state and progress
 * fraction comes pre-computed from lib/gamification/badges.ts's deterministic
 * rules (statsService.ts) — this only chooses how an earned vs. a
 * still-locked tile looks.
 */
export function BadgesGrid({ badges }: BadgesGridProps) {
  const earnedCount = badges.filter((b) => b.earned).length;

  return (
    <GlassCard className="flex flex-col gap-3">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">הישגים</h3>
        <span className="ltr text-xs tabular-nums text-muted">
          {earnedCount}/{badges.length}
        </span>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {badges.map((badge) => {
          const Icon = ICONS[badge.icon];
          const progressPercent = Math.round(badge.progress * 100);

          return (
            <div
              key={badge.id}
              title={badge.description}
              className={cn(
                "relative flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors",
                badge.earned
                  ? "border-[var(--accent-faith)] bg-[color-mix(in_srgb,var(--accent-faith)_12%,transparent)]"
                  : "border-hairline-card bg-fill-subtle opacity-70"
              )}
            >
              {badge.isNew && (
                <span className="absolute -end-1.5 -top-1.5 rounded-full bg-accent-family px-1.5 py-0.5 text-[0.6rem] font-semibold text-white">
                  חדש!
                </span>
              )}

              <span
                className={cn(
                  "grid size-10 place-items-center rounded-full",
                  badge.earned
                    ? "bg-[color-mix(in_srgb,var(--accent-faith)_20%,transparent)] text-accent-faith"
                    : "bg-fill text-muted"
                )}
              >
                <Icon size={20} aria-hidden />
              </span>

              <p className="text-xs font-medium text-foreground">{badge.title}</p>

              {!badge.earned && (
                <div
                  className="h-1 w-full overflow-hidden rounded-full bg-fill"
                  role="progressbar"
                  aria-valuenow={progressPercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`התקדמות לקראת ${badge.title}: ${progressPercent} אחוז`}
                >
                  <div className="h-full rounded-full bg-accent-faith" style={{ width: `${progressPercent}%` }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}
