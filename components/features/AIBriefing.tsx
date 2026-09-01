"use client";

import { useEffect, useState } from "react";
import { Sparkles, AlertCircle } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { BriefingSignalList, type BriefingSignal } from "@/components/features/BriefingSignalList";

interface Briefing {
  signals: BriefingSignal[];
  conflicts: string[];
}

// The Experience Layer's flagship surface (docs/ATLAS_ARCHITECTURE_
// VISION.md §10): renders the same ranked-signal pipeline every AI route
// already consumes, for a person instead of a model — an executive
// briefing, not a chat transcript. Fetches client-side on mount, same
// established pattern as ScheduleSuggestions, so it doesn't add a query to
// the initial page-load bootstrap for a card that's allowed to arrive a
// beat after the rest of the page.
interface AIBriefingProps {
  /** Rendered inside another card (e.g. a dashboard BentoCard) — drop our own
   * frame so the two don't nest. */
  bare?: boolean;
}

export function AIBriefing({ bare = false }: AIBriefingProps = {}) {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/briefing")
      .then((res) => (res.ok ? res.json() : { signals: [], conflicts: [] }))
      .then((data: Briefing) => {
        if (!cancelled) setBriefing(data);
      })
      .catch(() => {
        if (!cancelled) setBriefing({ signals: [], conflicts: [] });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <GlassCard delay={0.05} bare={bare}>
        <p className="mb-4 flex items-center gap-2 text-sm font-medium text-muted">
          <Sparkles size={16} className="text-accent-knowledge" />
          התדריך היומי
        </p>
        <div className="flex flex-col gap-2.5" aria-hidden>
          {[85, 70, 55].map((width, i) => (
            <div key={i} className="h-4 animate-pulse rounded-full bg-fill-subtle" style={{ width: `${width}%` }} />
          ))}
        </div>
      </GlassCard>
    );
  }

  // Not gamified emptiness ("no data yet, keep going!") — just quietly
  // absent, the same way ScheduleSuggestions returns nothing rather than
  // an empty-state card once there's genuinely nothing to say. In `bare`
  // mode the surrounding card is already on the page, so disappearing would
  // leave an empty frame — a single quiet line goes there instead.
  if (!briefing || briefing.signals.length === 0) {
    if (!bare) return null;
    return (
      <GlassCard delay={0.05} bare>
        <p className="mb-4 flex items-center gap-2 text-sm font-medium text-muted">
          <Sparkles size={16} className="text-accent-knowledge" />
          התדריך היומי
        </p>
        <p className="text-xs text-muted">אין כרגע מה לדווח.</p>
      </GlassCard>
    );
  }

  return (
    <GlassCard delay={0.05} bare={bare}>
      <p className="mb-4 flex items-center gap-2 text-sm font-medium text-muted">
        <Sparkles size={16} className="text-accent-knowledge" />
        התדריך היומי
      </p>

      <BriefingSignalList signals={briefing.signals} baseDelay={0.1} />

      {briefing.conflicts.length > 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-fill-subtle p-3 text-xs text-muted">
          <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden />
          <div className="flex flex-col gap-1">
            {/* Conflict notes are free text from the ranking pipeline and can
                legitimately repeat, so the text alone isn't a unique key. */}
            {briefing.conflicts.map((note, idx) => (
              <p key={`${note}-${idx}`}>{note}</p>
            ))}
          </div>
        </div>
      )}
    </GlassCard>
  );
}
