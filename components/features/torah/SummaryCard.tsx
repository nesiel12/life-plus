"use client";

import { Pencil, Trash2 } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { SummaryContent } from "@/components/features/summaries/SummaryContent";
import type { Summary } from "@/types";

interface SummaryCardProps {
  summary: Summary;
  delay: number;
  onDelete: (id: string) => void;
  /** Reopens this summary in the editor — the "resume" half of pause-and-resume. */
  onEdit?: (id: string) => void;
}

export function SummaryCard({ summary, delay, onDelete, onEdit }: SummaryCardProps) {
  return (
    <GlassCard delay={delay} className="p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 font-medium text-foreground">
          <span className="truncate">{summary.title}</span>
          {/* An unfinished draft is called out rather than looking identical
              to a finished summary — that visibility is what makes leaving
              one half-written safe. */}
          {summary.isDraft && (
            <span className="glass-control shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] text-gold-ink">
              טיוטה
            </span>
          )}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <span className="ltr text-xs text-muted">{summary.date}</span>
          {onEdit && (
            <button
              onClick={() => onEdit(summary.id)}
              aria-label={`ערוך את ${summary.title}`}
              className="focus-ring rounded-lg p-1 text-muted transition-colors hover:text-gold-ink"
            >
              <Pencil size={13} />
            </button>
          )}
          <button
            onClick={() => onDelete(summary.id)}
            aria-label={`מחק את ${summary.title}`}
            className="focus-ring rounded-lg p-1 text-muted transition-colors hover:text-accent-family"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      <SummaryContent html={summary.contentHtml} text={summary.content} className="text-sm text-foreground/80" />
    </GlassCard>
  );
}
