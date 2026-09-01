"use client";

import { Zap } from "lucide-react";
import { useInsights } from "@/hooks/useInsights";
import type { EnergyLevel } from "@/lib/energy/deriveEnergyLevel";
import type { MomentCategory } from "@/types";

interface EnergyResponse {
  level: EnergyLevel;
  matchingAreas: MomentCategory[];
  rationale: string;
}

const FALLBACK: EnergyResponse = { level: "unknown", matchingAreas: [], rationale: "" };

// Today's energy-level line (docs/ATLAS_ARCHITECTURE_VISION.md §12): a real,
// confidence-gated signal from the Personal DNA Engine (§3), not a
// decoration — quiet-empty-state convention every other Experience Layer
// surface follows (§10): "unknown" (cold start, no evidence yet) renders
// nothing at all rather than a fabricated placeholder.
export function EnergyLevelBadge() {
  const { data } = useInsights<EnergyResponse>("/api/today/energy", FALLBACK);

  if (!data || data.level === "unknown") return null;

  return (
    <p className="inline-flex items-center gap-1.5 rounded-full border border-hairline-card bg-surface/70 px-3 py-1.5 text-xs text-muted">
      <Zap size={12} className={data.level === "peak" ? "text-accent-faith" : "text-muted"} aria-hidden />
      {data.rationale}
    </p>
  );
}
