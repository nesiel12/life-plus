"use client";

import { useState } from "react";
import { CirTabs } from "@/components/features/dashboard/CirTabs";
import { renderCard } from "@/components/features/dashboard/ContextSwitcher";
import { AIBriefing } from "@/components/features/AIBriefing";
import { TodayStructureCard } from "@/components/features/dashboard/TodayStructureCard";
import { HebrewCalendarCard } from "@/components/features/dashboard/HebrewCalendarCard";
import { IntentionComposer } from "@/components/features/dashboard/IntentionComposer";
import { GlassCard } from "@/components/ui/GlassCard";
import { cardsForWindow, type ContextWindow, type ResolvedContext } from "@/lib/dashboard/context";

type Tab = ContextWindow | "briefing";

const TABS: { value: Tab; label: string }[] = [
  { value: "briefing", label: "תדריך" },
  { value: "morning", label: "בוקר" },
  { value: "work", label: "עבודה" },
  { value: "evening", label: "ערב" },
  { value: "night", label: "לילה" },
];

interface SecondaryZoneProps {
  context: ResolvedContext;
  now: Date;
}

/**
 * Everything that isn't the day's single top priority (HeroFocusCard), the
 * quick-capture bar, or one of the five full-size widgets left in the main
 * grid — organized into one compact, always-visible tab group instead of
 * competing for attention as its own full-width band (the old
 * ContextSwitcher) plus widgets floated into the grid (the old
 * lib/dashboard/context.ts `promote`).
 *
 * Opens on the live time-of-day window by default, but every window's cards
 * are one tab away regardless of the hour — unlike the old band, which only
 * ever showed "now". Energy-based reranking (cardsForWindow) still uses the
 * *real* current energy reading no matter which tab is open: how much energy
 * there is right now doesn't depend on which window's cards you're browsing.
 */
export function SecondaryZone({ context, now }: SecondaryZoneProps) {
  const [active, setActive] = useState<Tab>(context.window);

  return (
    <section
      aria-label="פרטים נוספים"
      className="mb-6 rounded-3xl border border-hairline-card bg-surface-sunken/50 p-4 sm:p-5"
    >
      <CirTabs value={active} onChange={setActive} options={TABS} label="קבוצת כרטיסים" className="mb-4 max-w-lg" />
      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
        {active === "briefing" ? (
          <>
            <AIBriefing />
            <GlassCard>
              <TodayStructureCard />
            </GlassCard>
            <GlassCard>
              <HebrewCalendarCard />
            </GlassCard>
            <GlassCard>
              <IntentionComposer />
            </GlassCard>
          </>
        ) : (
          cardsForWindow(active, context.energy).map((id) => (
            <div key={id} className="min-w-0">
              {renderCard(id, context, now)}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
