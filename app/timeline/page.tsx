"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Award, Circle, Target, type LucideIcon } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { buildTimelineEvents } from "@/lib/timeline/buildTimelineEvents";
import { groupEventsByDate } from "@/lib/timeline/groupEvents";
import type { TimelineEvent } from "@/lib/timeline/types";
import { LIFE_AREA_LIST, momentCategoryColorVar } from "@/lib/lifeAreas";
import { LIFE_AREA_ICONS } from "@/lib/lifeAreaIcons";
import { cn } from "@/lib/utils";
import type { MomentCategory } from "@/types";

type FilterValue = MomentCategory | "all";

// Kind takes precedence over category for iconography — an achievement or a
// goal starting is a distinct *kind* of life event, not just another
// category-colored moment. Falls back to the same category icon/color every
// other screen already uses (lib/lifeAreas.ts) so the Timeline never
// invents a second visual language for "what area is this."
function iconForEvent(event: TimelineEvent): LucideIcon {
  if (event.kind === "milestone_achieved") return Award;
  if (event.kind === "goal_started") return Target;
  if (event.category === "general") return Circle;
  return LIFE_AREA_ICONS[event.category];
}

interface FilterChipProps {
  active: boolean;
  label: string;
  colorVar?: string;
  onClick: () => void;
}

function FilterChip({ active, label, colorVar, onClick }: FilterChipProps) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        active ? "border-transparent text-background" : "border-glass-border text-muted hover:text-foreground"
      )}
      style={active ? { backgroundColor: colorVar ? `var(${colorVar})` : "var(--foreground)" } : undefined}
    >
      {label}
    </button>
  );
}

export default function TimelinePage() {
  const moments = useAtlasStore((s) => s.moments);
  const goals = useAtlasStore((s) => s.goals);
  const knowledgeEntries = useAtlasStore((s) => s.knowledgeEntries);
  const [filter, setFilter] = useState<FilterValue>("all");

  // Timeline Experience v1 (docs/ATLAS_ARCHITECTURE_VISION.md §6): a true
  // cross-entity "life story" instead of a moments-only log — the same
  // already-hydrated store slices every other screen reads, merged by the
  // pure lib/timeline pipeline rather than a second data-fetch.
  const events = useMemo(
    () => buildTimelineEvents({ moments, goals, knowledgeEntries }),
    [moments, goals, knowledgeEntries]
  );

  const filtered = useMemo(
    () => (filter === "all" ? events : events.filter((e) => e.category === filter)),
    [events, filter]
  );

  const grouped = useMemo(() => groupEventsByDate(filtered), [filtered]);

  let cardIndex = 0;

  return (
    <main className="min-h-screen px-6 py-16 sm:px-10 lg:px-16">
      <h1 className="mb-1 text-2xl font-medium tracking-tight">ציר הזמן</h1>
      <p className="mb-6 text-sm text-muted">
        הסיפור של החיים שלך — רגעים, יעדים והישגים במקום אחד. ⌘K בכל מקום כדי להוסיף רגע חדש.
      </p>

      <div className="mb-10 flex flex-wrap gap-2">
        <FilterChip active={filter === "all"} label="הכל" onClick={() => setFilter("all")} />
        {LIFE_AREA_LIST.map((area) => (
          <FilterChip
            key={area.key}
            active={filter === area.key}
            label={area.label}
            colorVar={area.colorVar}
            onClick={() => setFilter(area.key)}
          />
        ))}
      </div>

      <div className="flex flex-col gap-8">
        {grouped.map((group) => (
          <section key={group.label}>
            <h2 className="mb-3 text-xs font-medium tracking-wide text-muted">{group.label}</h2>
            <ol className="flex flex-col gap-3">
              {group.events.map((event) => {
                const Icon = iconForEvent(event);
                const delay = Math.min(cardIndex++ * 0.04, 0.6);
                return (
                  <motion.li
                    key={event.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay, ease: "easeOut" }}
                    className="glass-card rounded-2xl p-4"
                    style={{ borderInlineStart: `3px solid var(${momentCategoryColorVar(event.category)})` }}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <Icon
                        size={14}
                        className={cn("shrink-0", event.achievement ? "text-accent-faith" : "text-muted")}
                        aria-hidden
                      />
                      <h3 className="text-sm font-medium text-foreground">{event.title}</h3>
                      {event.achievement && (
                        <span className="rounded-full bg-accent-faith/15 px-2 py-0.5 text-xs text-accent-faith">
                          הישג
                        </span>
                      )}
                    </div>
                    {event.description && (
                      <p className="text-sm leading-relaxed text-foreground/80">{event.description}</p>
                    )}
                  </motion.li>
                );
              })}
            </ol>
          </section>
        ))}

        {events.length === 0 && (
          <p className="text-sm text-muted">אין עדיין רגעים. לחץ ⌘K כדי ללכוד את הראשון.</p>
        )}
        {events.length > 0 && filtered.length === 0 && (
          <p className="text-sm text-muted">אין עדיין רגעים בתחום הזה.</p>
        )}
      </div>
    </main>
  );
}
