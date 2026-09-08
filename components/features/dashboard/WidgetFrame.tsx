"use client";

import { useState, type DragEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, EyeOff, GripVertical, Scaling } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WidgetDefinition, WidgetSpan } from "@/lib/dashboard/layout";
import { useT, type TranslationKey } from "@/lib/i18n/useT";
import { dictionaries } from "@/lib/i18n/dictionaries";

interface WidgetFrameProps {
  widget: WidgetDefinition;
  span: WidgetSpan;
  editing: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMove: (delta: number) => void;
  onDropOn: (draggedId: string) => void;
  onHide: () => void;
  onResize: () => void;
  children: ReactNode;
}

const SPAN_CLASS: Record<WidgetSpan, string> = {
  1: "",
  2: "sm:col-span-2",
  3: "sm:col-span-2 lg:col-span-3",
};

// Edit-mode chrome around one dashboard widget.
//
// Dragging uses the native HTML5 drag events rather than a library. The bento
// is a two-dimensional responsive grid, and the one drag dependency already
// installed — framer-motion's Reorder — is single-axis, so it cannot express
// "move this card from the end of row one to the middle of row three"
// without collapsing the grid into a list while editing.
//
// Native drag is not keyboard-operable, which is why the arrow buttons are
// not a convenience: they are the accessible path to the same operation, and
// every rearrangement possible with the mouse is possible with them.
export function WidgetFrame({
  widget,
  span,
  editing,
  isFirst,
  isLast,
  onMove,
  onDropOn,
  onHide,
  onResize,
  children,
}: WidgetFrameProps) {
  const t = useT();
  // widget.<id> keys exist for the shipped widgets; fall back to the
  // registry's Hebrew title for anything not in the dictionary.
  const widgetKey = `widget.${widget.id}` as TranslationKey;
  const title = widgetKey in dictionaries.he ? t(widgetKey) : widget.title;
  const [dragOver, setDragOver] = useState(false);

  function handleDragStart(event: DragEvent) {
    event.dataTransfer.setData("text/plain", widget.id);
    event.dataTransfer.effectAllowed = "move";
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setDragOver(false);
    const draggedId = event.dataTransfer.getData("text/plain");
    if (draggedId && draggedId !== widget.id) onDropOn(draggedId);
  }

  return (
    <div
      className={cn("relative", SPAN_CLASS[span], dragOver && "ring-2 ring-[var(--gold)] ring-offset-2 rounded-2xl")}
      onDragOver={
        editing
          ? (e) => {
              // preventDefault is what marks this a valid drop target; without
              // it the browser refuses the drop and the card springs back.
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDragOver(true);
            }
          : undefined
      }
      onDragLeave={editing ? () => setDragOver(false) : undefined}
      onDrop={editing ? handleDrop : undefined}
    >
      {editing && (
        <div className="mb-1.5 flex items-center gap-1 rounded-xl border border-dashed border-gold-line bg-gold-soft/40 px-2 py-1">
          <span
            draggable
            onDragStart={handleDragStart}
            onDragEnd={() => setDragOver(false)}
            aria-hidden
            className="cursor-grab text-muted active:cursor-grabbing"
          >
            <GripVertical size={13} />
          </span>
          <span className="min-w-0 flex-1 truncate text-[0.7rem] font-medium text-gold-ink">{title}</span>

          {/* RTL: ChevronRight moves earlier, ChevronLeft moves later. */}
          <button
            onClick={() => onMove(-1)}
            disabled={isFirst}
            aria-label={`הזז את ${title} אחורה`}
            className="focus-ring rounded p-0.5 text-muted transition-colors hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight size={12} aria-hidden />
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={isLast}
            aria-label={`הזז את ${title} קדימה`}
            className="focus-ring rounded p-0.5 text-muted transition-colors hover:text-foreground disabled:opacity-30"
          >
            <ChevronLeft size={12} aria-hidden />
          </button>
          <button
            onClick={onResize}
            aria-label={`שנה רוחב של ${title} (כרגע ${span})`}
            className="focus-ring flex items-center gap-0.5 rounded p-0.5 text-muted transition-colors hover:text-foreground"
          >
            <Scaling size={12} aria-hidden />
            <span className="ltr tabular-nums text-[0.65rem]">{span}</span>
          </button>
          <button
            onClick={onHide}
            aria-label={`הסתר את ${title}`}
            className="focus-ring rounded p-0.5 text-muted transition-colors hover:text-accent-family"
          >
            <EyeOff size={12} aria-hidden />
          </button>
        </div>
      )}

      {/* Interaction is blocked while editing: the cards are full of their
          own buttons and links, and a click meant to pick a card up would
          otherwise navigate away from the dashboard mid-rearrange. */}
      <div className={cn(editing && "pointer-events-none select-none opacity-90")}>{children}</div>
    </div>
  );
}
