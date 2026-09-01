"use client";

import { MoreVertical } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import type { Rabbi } from "@/types";

interface RabbiCardProps {
  rabbi: Rabbi;
  delay: number;
  onEdit: (rabbi: Rabbi) => void;
  onOpenProfile: (rabbi: Rabbi) => void;
}

export function RabbiCard({ rabbi, delay, onEdit, onOpenProfile }: RabbiCardProps) {
  return (
    <GlassCard delay={delay} className="h-full" onClick={() => onOpenProfile(rabbi)}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{rabbi.name}</p>
          {rabbi.title && <p className="mt-0.5 text-xs text-muted">{rabbi.title}</p>}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(rabbi);
          }}
          aria-label={`ערוך את ${rabbi.name}`}
          className="focus-ring shrink-0 rounded-lg p-1 text-muted transition-colors hover:bg-fill-subtle hover:text-foreground"
        >
          <MoreVertical size={16} />
        </button>
      </div>
      {rabbi.notes && <p className="text-sm leading-relaxed text-foreground/70">{rabbi.notes}</p>}
    </GlassCard>
  );
}
