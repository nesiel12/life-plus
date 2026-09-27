import type { ReactNode } from "react";
import type { ContextCardId, ResolvedContext } from "@/lib/dashboard/context";
import { EnergyCard, TopThreeCard, TorahCard, WaterCard } from "@/components/features/dashboard/context/MorningCards";
import { FocusCard, PriorityTasksCard } from "@/components/features/dashboard/context/WorkCards";
import {
  FamilyCard,
  GratitudeCard,
  HabitsCard,
  ReflectionCard,
} from "@/components/features/dashboard/context/EveningCards";
import { SleepCard, TomorrowCard } from "@/components/features/dashboard/context/NightCards";

// Maps a context card id to its component, with the right props threaded
// (energy, now). Used to be the internals of a standalone time-of-day band
// component (ContextSwitcher); that band is gone — its cards now live as tab
// content inside SecondaryZone.tsx, which imports this function directly —
// but the id → component mapping itself didn't need to change, so it stayed
// here rather than being rewritten.
export function renderCard(id: ContextCardId, context: ResolvedContext, now: Date): ReactNode {
  switch (id) {
    case "energy":
      return <EnergyCard energy={context.energy} />;
    case "torah":
      return <TorahCard />;
    case "water":
      return <WaterCard />;
    case "fuel":
      return <WaterCard withMeal />;
    case "top-three":
      // skip=1: the single highest-priority goal is already the Hero Focus
      // Card above the fold — this shows what comes after it, not a repeat.
      return <TopThreeCard skip={1} />;
    case "priority-tasks":
      return <PriorityTasksCard energy={context.energy} now={now} />;
    case "focus":
      return <FocusCard energy={context.energy} now={now} />;
    case "family":
      return <FamilyCard now={now} />;
    case "reflection":
      return <ReflectionCard />;
    case "gratitude":
      return <GratitudeCard />;
    case "habits":
      return <HabitsCard now={now} />;
    case "sleep":
      return <SleepCard now={now} />;
    case "tomorrow":
      return <TomorrowCard now={now} />;
  }
}
