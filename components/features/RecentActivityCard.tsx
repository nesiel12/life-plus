"use client";

import { useMemo } from "react";
import { Activity, Sparkles } from "lucide-react";
import { AnimatedList } from "@/components/magicui/animated-list";
import { useAtlasStore } from "@/store/useAtlasStore";
import { momentCategoryColorVar, momentCategoryLabel } from "@/lib/lifeAreas";
import { daysSince } from "@/lib/utils";

const MAX_ROWS = 5;

interface Entry {
  id: string;
  title: string;
  detail: string;
  meta: string;
  colorVar: string;
  kind: "moment" | "insight";
}

function relativeLabel(iso: string): string {
  const days = daysSince(iso);
  if (days <= 0) return "היום";
  if (days === 1) return "אתמול";
  if (days < 7) return `לפני ${days} ימים`;
  if (days < 30) return `לפני ${Math.floor(days / 7)} שבועות`;
  return `לפני ${Math.floor(days / 30)} חודשים`;
}

// One row of the feed. Every text node is clamped — the AnimatedList animates
// height, so an unbounded string is exactly what makes it spill out of the
// card. Nothing here is allowed to grow past two lines.
function ActivityRow({ entry }: { entry: Entry }) {
  const Icon = entry.kind === "insight" ? Sparkles : Activity;
  return (
    <div className="flex w-full min-w-0 items-start gap-3 rounded-xl border border-hairline-card bg-surface-sunken/70 px-3.5 py-3">
      <span
        aria-hidden
        className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full"
        style={{
          background: `color-mix(in srgb, var(${entry.colorVar}) 14%, transparent)`,
          color: `var(${entry.colorVar})`,
        }}
      >
        <Icon size={13} />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-sm font-medium text-foreground">{entry.title}</p>
        {entry.detail && (
          <p className="line-clamp-2 break-words text-xs leading-relaxed text-muted">
            {entry.detail}
          </p>
        )}
      </div>

      <span className="shrink-0 whitespace-nowrap text-[0.65rem] text-muted">{entry.meta}</span>
    </div>
  );
}

// Recent activity / notifications: the newest moments and AI insights, merged
// newest-first and revealed one at a time by MagicUI's AnimatedList.
export function RecentActivityCard() {
  const moments = useAtlasStore((s) => s.moments);
  const insights = useAtlasStore((s) => s.insights);

  const entries = useMemo<Entry[]>(() => {
    const fromMoments: (Entry & { ts: string })[] = moments.map((m) => ({
      id: `moment-${m.id}`,
      ts: m.timestamp,
      title: m.title,
      detail: m.content,
      meta: `${momentCategoryLabel(m.category)} · ${relativeLabel(m.timestamp)}`,
      colorVar: momentCategoryColorVar(m.category),
      kind: "moment" as const,
    }));

    const fromInsights: (Entry & { ts: string })[] = insights.map((i) => ({
      id: `insight-${i.id}`,
      ts: i.timestamp,
      title: "תובנה חדשה",
      detail: i.content,
      meta: relativeLabel(i.timestamp),
      colorVar: "--gold",
      kind: "insight" as const,
    }));

    return [...fromMoments, ...fromInsights]
      .sort((a, b) => b.ts.localeCompare(a.ts))
      .slice(0, MAX_ROWS);
  }, [moments, insights]);

  return (
    <>
      <p className="mb-4 flex items-center gap-2 text-sm font-medium text-muted">
        <Activity size={16} className="text-gold-ink" aria-hidden />
        פעילות אחרונה
      </p>

      {entries.length === 0 ? (
        <p className="text-xs text-muted">עוד לא נרשמה פעילות.</p>
      ) : (
        // Fixed max height + overflow-hidden: the list grows as items arrive
        // and must never push past the card's own bounds.
        <div className="relative max-h-[19rem] flex-1 overflow-hidden [mask-image:linear-gradient(to_bottom,black_82%,transparent)]">
          <AnimatedList delay={900} className="w-full gap-2.5">
            {entries.map((entry) => (
              <ActivityRow key={entry.id} entry={entry} />
            ))}
          </AnimatedList>
        </div>
      )}
    </>
  );
}
