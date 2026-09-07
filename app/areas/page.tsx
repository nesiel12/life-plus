"use client";

import { useAtlasStore } from "@/store/useAtlasStore";
import { AreaHealthCard } from "@/components/features/AreaHealthCard";
import { useInsights } from "@/hooks/useInsights";
import { LIFE_AREAS } from "@/lib/lifeAreas";
import type { AreaInsight } from "@/lib/areas/types";
import type { LifeAreaKey } from "@/types";
import { BackToHome } from "@/components/layout/BackToHome";

// Areas Experience v2 (docs/ATLAS_ARCHITECTURE_VISION.md §10): the Life
// Dashboard — a central map, not a navigation grid. Score/progress still
// render instantly from the live store (unchanged); attention, stats, and
// the one highlight line per card layer in once app/api/areas/insights
// resolves, the same progressive-enhancement convention every other
// Experience Layer screen uses.
export default function AreasPage() {
  const lifeAreas = useAtlasStore((s) => s.lifeAreas);
  const { data } = useInsights<{ areas: AreaInsight[] }>("/api/areas/insights", { areas: [] });
  const insights = data?.areas ?? null;

  const insightByKey = new Map((insights ?? []).map((i) => [i.areaKey, i]));
  // The Intelligence Engine's own per-area ranking (app/api/areas/insights)
  // decides render order once it's loaded — areas needing attention or
  // carrying a confident behavioral insight surface first, instead of a
  // fixed enum order. Falls back to the store's own order while loading.
  const orderedKeys: LifeAreaKey[] = insights
    ? insights.map((i) => i.areaKey)
    : lifeAreas.map((a) => a.key);

  return (
    <main className="min-h-screen px-6 py-16 sm:px-10 lg:px-16">
      <BackToHome className="mb-6 -ms-2.5" />
      <h1 className="mb-1 text-2xl font-medium tracking-tight">תחומי חיים</h1>
      <p className="mb-10 text-sm text-muted">המפה המרכזית של החיים שלך.</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {orderedKeys.map((key, i) => (
          <AreaHealthCard key={key} meta={LIFE_AREAS[key]} insight={insightByKey.get(key)} delay={Math.min(i * 0.06, 0.3)} />
        ))}
      </div>
    </main>
  );
}
