"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, X } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { isFirst, isLast, sorted } from "@/lib/summaries/ordering";
import { cn } from "@/lib/utils";

interface SectionManagerProps {
  /** null = the built-in "all summaries" tab. */
  activeSectionId: string | null;
  onSelect: (sectionId: string | null) => void;
}

// User-defined top-level sections, rendered as tabs with inline management.
//
// Editing lives behind a toggle rather than being always-visible: these
// controls are used once when setting a workflow up and then almost never,
// and permanent reorder arrows on every tab would clutter the primary
// navigation for the 99% of visits that are just switching tabs.
export function SectionManager({ activeSectionId, onSelect }: SectionManagerProps) {
  const sections = useAtlasStore((s) => s.summarySections);
  const summaries = useAtlasStore((s) => s.summaries);
  const addSection = useAtlasStore((s) => s.addSummarySection);
  const deleteSection = useAtlasStore((s) => s.deleteSummarySection);
  const reorderSections = useAtlasStore((s) => s.reorderSummarySections);

  const [managing, setManaging] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const ordered = sorted(sections);

  function countFor(sectionId: string | null): number {
    return summaries.filter((s) => (s.sectionId ?? null) === sectionId).length;
  }

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    await addSection({ name: trimmed }).catch(() => {});
    setName("");
    setAdding(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="מדורי סיכומים">
        <button
          role="tab"
          aria-selected={activeSectionId === null}
          onClick={() => onSelect(null)}
          className={cn(
            "focus-ring rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            activeSectionId === null
              ? "glass-control glass-control-active text-foreground"
              : "glass-control-hover text-muted hover:text-foreground"
          )}
        >
          הכל
          <span className="ltr ms-1.5 tabular-nums text-muted">{summaries.length}</span>
        </button>

        {ordered.map((section) => (
          <div key={section.id} className="flex items-center">
            <button
              role="tab"
              aria-selected={activeSectionId === section.id}
              onClick={() => onSelect(section.id)}
              className={cn(
                "focus-ring rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                activeSectionId === section.id
                  ? "glass-control glass-control-active text-foreground"
                  : "glass-control-hover text-muted hover:text-foreground"
              )}
            >
              {section.name}
              <span className="ltr ms-1.5 tabular-nums text-muted">{countFor(section.id)}</span>
            </button>

            {managing && (
              <span className="ms-0.5 flex items-center">
                <button
                  onClick={() => reorderSections(section.id, -1).catch(() => {})}
                  disabled={isFirst(ordered, section.id)}
                  aria-label={`הזז את ${section.name} אחורה`}
                  className="focus-ring grid size-6 place-items-center rounded text-muted transition-colors hover:text-foreground disabled:opacity-30"
                >
                  <ChevronRight size={12} aria-hidden />
                </button>
                <button
                  onClick={() => reorderSections(section.id, 1).catch(() => {})}
                  disabled={isLast(ordered, section.id)}
                  aria-label={`הזז את ${section.name} קדימה`}
                  className="focus-ring grid size-6 place-items-center rounded text-muted transition-colors hover:text-foreground disabled:opacity-30"
                >
                  <ChevronLeft size={12} aria-hidden />
                </button>
                <button
                  onClick={() => {
                    if (confirmingDelete === section.id) {
                      deleteSection(section.id).catch(() => {});
                      if (activeSectionId === section.id) onSelect(null);
                      setConfirmingDelete(null);
                    } else {
                      setConfirmingDelete(section.id);
                    }
                  }}
                  aria-label={
                    confirmingDelete === section.id
                      ? `אשר מחיקה של ${section.name}`
                      : `מחק את ${section.name}`
                  }
                  className={cn(
                    "focus-ring grid size-6 place-items-center rounded transition-colors",
                    confirmingDelete === section.id
                      ? "text-accent-family"
                      : "text-muted hover:text-accent-family"
                  )}
                >
                  <Trash2 size={12} aria-hidden />
                </button>
              </span>
            )}
          </div>
        ))}

        {adding ? (
          <span className="flex items-center gap-1">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") {
                  setAdding(false);
                  setName("");
                }
              }}
              placeholder="שם המדור"
              aria-label="שם המדור החדש"
              autoFocus
              className="focus-ring w-32 rounded-lg border border-hairline-card bg-surface-sunken px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted"
            />
            <button
              onClick={submit}
              disabled={!name.trim()}
              className="glass-control focus-ring rounded-lg px-2.5 py-1.5 text-xs text-foreground disabled:opacity-40"
            >
              הוסף
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setName("");
              }}
              aria-label="בטל"
              className="focus-ring grid size-6 place-items-center rounded text-muted hover:text-foreground"
            >
              <X size={12} aria-hidden />
            </button>
          </span>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="glass-control-hover focus-ring flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
          >
            <Plus size={12} aria-hidden />
            מדור
          </button>
        )}

        {ordered.length > 0 && (
          <button
            onClick={() => {
              setManaging((v) => !v);
              setConfirmingDelete(null);
            }}
            aria-pressed={managing}
            className="focus-ring ms-auto rounded-lg px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
          >
            {managing ? "סיום" : "ארגן"}
          </button>
        )}
      </div>

      {managing && confirmingDelete && (
        // Says what deletion actually does. Users reasonably assume removing
        // a category removes its contents; it does not, and saying so is what
        // makes the button safe to press.
        <p className="text-xs text-muted">
          מחיקת מדור לא מוחקת את הסיכומים שבו — הם יחזרו לרשימה הכללית. לחץ שוב כדי לאשר.
        </p>
      )}
    </div>
  );
}
