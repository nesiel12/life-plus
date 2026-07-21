"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Sparkles,
  Target,
  Compass,
  CalendarClock,
  HeartHandshake,
  Clock,
  TrendingUp,
  Brain,
  AlertCircle,
  type LucideIcon,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";

type SignalCategory =
  | "personalDNA"
  | "personalPattern"
  | "goal"
  | "lifeArea"
  | "upcomingEvent"
  | "relationship"
  | "memory"
  | "recommendation";

interface BriefingSignal {
  id: string;
  category: SignalCategory;
  summary: string;
  confidence: number;
}

interface Briefing {
  signals: BriefingSignal[];
  conflicts: string[];
}

const CATEGORY_ICON: Record<SignalCategory, LucideIcon> = {
  personalDNA: Brain,
  personalPattern: Sparkles,
  goal: Target,
  lifeArea: Compass,
  upcomingEvent: CalendarClock,
  relationship: HeartHandshake,
  memory: Clock,
  recommendation: TrendingUp,
};

const LOW_CONFIDENCE_THRESHOLD = 0.5;

// The Experience Layer's flagship surface (docs/ATLAS_ARCHITECTURE_
// VISION.md §10): renders the same ranked-signal pipeline every AI route
// already consumes, for a person instead of a model — an executive
// briefing, not a chat transcript. Fetches client-side on mount, same
// established pattern as ScheduleSuggestions, so it doesn't add a query to
// the initial page-load bootstrap for a card that's allowed to arrive a
// beat after the rest of the page.
export function AIBriefing() {
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
      <GlassCard delay={0.05}>
        <p className="mb-4 flex items-center gap-2 text-sm font-medium text-muted">
          <Sparkles size={16} className="text-accent-knowledge" />
          התדריך היומי
        </p>
        <div className="flex flex-col gap-2.5" aria-hidden>
          {[85, 70, 55].map((width, i) => (
            <div key={i} className="h-4 animate-pulse rounded-md bg-white/5" style={{ width: `${width}%` }} />
          ))}
        </div>
      </GlassCard>
    );
  }

  // Not gamified emptiness ("no data yet, keep going!") — just quietly
  // absent, the same way ScheduleSuggestions returns nothing rather than
  // an empty-state card once there's genuinely nothing to say.
  if (!briefing || briefing.signals.length === 0) return null;

  return (
    <GlassCard delay={0.05}>
      <p className="mb-4 flex items-center gap-2 text-sm font-medium text-muted">
        <Sparkles size={16} className="text-accent-knowledge" />
        התדריך היומי
      </p>

      <ul className="flex flex-col gap-3">
        {briefing.signals.map((signal, i) => {
          const Icon = CATEGORY_ICON[signal.category];
          return (
            <motion.li
              key={signal.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.1 + i * 0.05, ease: "easeOut" }}
              className="flex items-start gap-2.5 text-sm text-foreground/90"
            >
              <Icon size={15} className="mt-0.5 shrink-0 text-muted" aria-hidden />
              <div className="flex flex-col gap-0.5">
                <span>{signal.summary}</span>
                {signal.confidence < LOW_CONFIDENCE_THRESHOLD && (
                  <span className="text-xs text-muted">ביטחון נמוך</span>
                )}
              </div>
            </motion.li>
          );
        })}
      </ul>

      {briefing.conflicts.length > 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-white/5 p-3 text-xs text-muted">
          <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden />
          <div className="flex flex-col gap-1">
            {briefing.conflicts.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
        </div>
      )}
    </GlassCard>
  );
}
