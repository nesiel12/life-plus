"use client";

import { MoreVertical } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { hebrewOnly, lifespanLabel } from "@/lib/torah/hebrew";
import { rabbiInitials } from "@/lib/torah/rabbiProfile";
import type { Rabbi } from "@/types";

interface RabbiCardProps {
  rabbi: Rabbi;
  delay: number;
  onEdit: (rabbi: Rabbi) => void;
  onOpenProfile: (rabbi: Rabbi) => void;
}

export function RabbiCard({ rabbi, delay, onEdit, onOpenProfile }: RabbiCardProps) {
  const name = hebrewOnly(rabbi.hebrewName) ?? rabbi.name;
  const lifespan = lifespanLabel(rabbi.birthYear, rabbi.deathYear);
  const bookCount = rabbi.works?.length ?? 0;

  return (
    <GlassCard delay={delay} className="h-full" onClick={() => onOpenProfile(rabbi)}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          {/* The same monogram the profile page uses, so the card and the
              page it opens read as one object. */}
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[radial-gradient(circle_at_30%_25%,#3b2f22,#15110c)] text-sm font-semibold text-[#e7cf9c] ring-2 ring-gold-line">
            {rabbiInitials(name)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{name}</p>
            {rabbi.title && <p className="mt-0.5 truncate text-xs text-muted">{rabbi.title}</p>}
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(rabbi);
          }}
          aria-label={`ערוך את ${name}`}
          className="focus-ring shrink-0 rounded-lg p-1 text-muted transition-colors hover:bg-fill-subtle hover:text-foreground"
        >
          <MoreVertical size={16} />
        </button>
      </div>

      {(rabbi.era || lifespan || bookCount > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-[0.68rem] text-muted">
          {rabbi.era && <span className="rounded-full bg-gold-soft px-2 py-0.5 text-gold-ink">{rabbi.era}</span>}
          {lifespan && <span className="rounded-full bg-fill-subtle px-2 py-0.5">{lifespan}</span>}
          {bookCount > 0 && <span className="rounded-full bg-fill-subtle px-2 py-0.5">{bookCount} חיבורים</span>}
        </div>
      )}
      {rabbi.notes && <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-foreground/70">{rabbi.notes}</p>}
    </GlassCard>
  );
}
