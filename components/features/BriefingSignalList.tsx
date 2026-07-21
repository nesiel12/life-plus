"use client";

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
  type LucideIcon,
} from "lucide-react";
import type { SignalCategory } from "@/lib/intelligence/core";

export interface BriefingSignal {
  id: string;
  category: SignalCategory;
  summary: string;
  confidence: number;
}

export const SIGNAL_CATEGORY_ICON: Record<SignalCategory, LucideIcon> = {
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

interface BriefingSignalListProps {
  signals: BriefingSignal[];
  // Lets a caller with its own header animation (AIBriefing's title fade-in)
  // continue the same stagger rather than restarting it at 0.
  baseDelay?: number;
}

// Shared ranked-signal rendering (AI Companion Experience v2, docs/ATLAS_
// ARCHITECTURE_VISION.md §10) — previously duplicated inline inside
// AIBriefing only; now the one place both AIBriefing (Today) and
// AICompanion's proactive opener render the same /api/briefing shape, so a
// third consumer doesn't have to choose between copying this again or
// finding it first.
export function BriefingSignalList({ signals, baseDelay = 0 }: BriefingSignalListProps) {
  return (
    <ul className="flex flex-col gap-3">
      {signals.map((signal, i) => {
        const Icon = SIGNAL_CATEGORY_ICON[signal.category];
        return (
          <motion.li
            key={signal.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: baseDelay + i * 0.05, ease: "easeOut" }}
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
  );
}
