"use client";

import { useEffect, useState } from "react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { AreaHealthCard } from "@/components/features/AreaHealthCard";
import { LIFE_AREAS } from "@/lib/lifeAreas";
import type { AreaInsight } from "@/lib/areas/types";
import type { LifeAreaKey } from "@/types";

// Areas Experience v2 (docs/ATLAS_ARCHITECTURE_VISION.md §10): the Life
// Dashboard — a central map, not a navigation grid. Score/progress still
// render instantly from the live store (unchanged); attention, stats, and
// the one highlight line per card layer in once app/api/areas/insights
// resolves, the same progressive-enhancement convention every other
// Experience Layer screen uses.
export default function AreasPage() {
  const lifeAreas = useAtlasStore((s) => s.lifeAreas);
  const [insights, setInsights] = useState<AreaInsight[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/areas/insights")
      .then((res) => (res.ok ? res.json() : { areas: [] }))
      .then((data: { areas: AreaInsight[] }) => {
        if (!cancelled) setInsights(data.areas);
      })
      .catch(() => {
        // Insights are a progressive enhancement — a failed fetch just
        // means cards render in the default order without them.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const insightByKey = new Map((insights ?? []).map((i) => [i.areaKey, i]));
  // The Intelligence Engine's own per-area ranking (app/api/areas/insights)
  // decides render order once it's loaded — areas needing attention or
  // carrying a confident behavioral insight surface first, instead of a
  // fixed enum order. Falls back to the store's own order while loading.
  const orderedKeys: LifeAreaKey[] = insights
    ? insights.map((i) => i.areaKey)
    : lifeAreas.map((a) => a.key);

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-16">
      <h1 className="mb-1 text-2xl font-medium tracking-tight">תחומי חיים</h1>
      <p className="mb-10 text-sm text-muted">המפה המרכזית של החיים שלך.</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {orderedKeys.map((key, i) => (
          <AreaHealthCard key={key} meta={LIFE_AREAS[key]} insight={insightByKey.get(key)} delay={Math.min(i * 0.06, 0.3)} />
        ))}
      </div>
    </main>
  );
}
