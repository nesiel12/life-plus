"use client";

import { Trash2 } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import type { Summary } from "@/types";

interface SummaryCardProps {
  summary: Summary;
  delay: number;
  onDelete: (id: string) => void;
}

export function SummaryCard({ summary, delay, onDelete }: SummaryCardProps) {
  return (
    <GlassCard delay={delay} className="p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-medium text-foreground">{summary.title}</span>
        <div className="flex shrink-0 items-center gap-2">
          <span className="ltr text-xs text-muted">{summary.date}</span>
          <button
            onClick={() => onDelete(summary.id)}
            aria-label={`מחק את ${summary.title}`}
            className="focus-ring rounded-lg p-1 text-muted transition-colors hover:text-accent-family"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/70">{summary.content}</p>
    </GlassCard>
  );
}
