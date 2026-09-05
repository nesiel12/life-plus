"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { SummaryContent } from "@/components/features/summaries/SummaryContent";
import type { Summary } from "@/types";

interface SummaryCardProps {
  summary: Summary;
  delay: number;
  onDelete: (id: string) => void;
  /** Reopens this summary in the editor — the "resume" half of pause-and-resume. */
  onEdit?: (id: string) => void;
  /** Section assignment + ordering controls, shown only in the organised view. */
  sections?: { id: string; name: string }[];
  onAssignSection?: (summaryId: string, sectionId: string | null) => void;
  onMove?: (summaryId: string, delta: number) => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  /** Pins this summary to the top of its section. */
  onTogglePin?: (summary: Summary) => void;
}

// How much of a summary the collapsed card shows.
//
// The card used to render every body in full, which made a list of long
// notes a page you scroll for a minute to find the third item. Collapsing
// is the compactness — but it is capped rather than removed, because a card
// showing only a title is a filename, not a summary.
const COLLAPSED_MAX_HEIGHT = "9rem";

export function SummaryCard({
  summary,
  delay,
  onDelete,
  onEdit,
  sections,
  onAssignSection,
  onMove,
  canMoveUp,
  canMoveDown,
  onTogglePin,
}: SummaryCardProps) {
  const [expanded, setExpanded] = useState(false);
  const pinned = Boolean(summary.pinnedAt);

  return (
    <GlassCard delay={delay} className="p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 font-medium text-foreground">
          {pinned && <Pin size={12} className="shrink-0 text-gold-ink" aria-hidden />}
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
          {onTogglePin && (
            <button
              onClick={() => onTogglePin(summary)}
              aria-pressed={pinned}
              aria-label={pinned ? `בטל נעיצה של ${summary.title}` : `נעץ את ${summary.title}`}
              className="focus-ring rounded-lg p-1 text-muted transition-colors hover:text-gold-ink"
            >
              {pinned ? <PinOff size={13} /> : <Pin size={13} />}
            </button>
          )}
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
      {/* Collapsed by default with a fade, and a control that says which way
          it goes. A plain overflow:hidden with no fade reads as a rendering
          bug — the text looks cut off rather than folded. */}
      <div className="relative">
        <div
          className="overflow-hidden transition-[max-height] duration-300"
          style={{ maxHeight: expanded ? "none" : COLLAPSED_MAX_HEIGHT }}
        >
          <SummaryContent html={summary.contentHtml} text={summary.content} className="text-sm text-foreground/80" />
        </div>
        {!expanded && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[var(--surface)] to-transparent"
          />
        )}
      </div>

      <button
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="focus-ring mt-1 flex items-center gap-1 rounded text-[0.7rem] text-muted transition-colors hover:text-foreground"
      >
        {expanded ? <ChevronUp size={11} aria-hidden /> : <ChevronDown size={11} aria-hidden />}
        {expanded ? "הצג פחות" : "קרא הכול"}
      </button>

      {!!summary.tags?.length && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {summary.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-fill-subtle px-2 py-0.5 text-[0.65rem] text-muted">
              {tag}
            </span>
          ))}
        </div>
      )}

      {(sections || onMove) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hairline-card pt-3">
          {sections && onAssignSection && (
            <label className="flex items-center gap-1.5 text-xs text-muted">
              מדור
              <select
                value={summary.sectionId ?? ""}
                onChange={(e) => onAssignSection(summary.id, e.target.value || null)}
                aria-label={`שייך את ${summary.title} למדור`}
                className="focus-ring rounded-lg border border-hairline-card bg-surface-sunken px-2 py-1 text-xs text-foreground"
              >
                <option value="">ללא מדור</option>
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {onMove && (
            <span className="flex items-center gap-0.5">
              <button
                onClick={() => onMove(summary.id, -1)}
                disabled={!canMoveUp}
                aria-label={`הזז את ${summary.title} למעלה`}
                className="focus-ring grid size-6 place-items-center rounded text-muted transition-colors hover:text-foreground disabled:opacity-30"
              >
                <ChevronUp size={12} aria-hidden />
              </button>
              <button
                onClick={() => onMove(summary.id, 1)}
                disabled={!canMoveDown}
                aria-label={`הזז את ${summary.title} למטה`}
                className="focus-ring grid size-6 place-items-center rounded text-muted transition-colors hover:text-foreground disabled:opacity-30"
              >
                <ChevronDown size={12} aria-hidden />
              </button>
            </span>
          )}
        </div>
      )}
    </GlassCard>
  );
}
