"use client";

import { Fragment, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, CornerDownLeft, Pencil, Pin, PinOff, Plus, Trash2, X } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { isFirst, isLast } from "@/lib/summaries/ordering";
import {
  buildSectionTree,
  eligibleParents,
  sectionAndDescendants,
  wouldExceedDepth,
} from "@/lib/summaries/hierarchy";
import { cn } from "@/lib/utils";
import type { SummarySection } from "@/types";

interface SectionManagerProps {
  /** null = the built-in "all summaries" tab. */
  activeSectionId: string | null;
  onSelect: (sectionId: string | null) => void;
}

// User-defined sections, rendered as tabs with inline management.
//
// Editing lives behind a toggle rather than being always-visible: these
// controls are used once when setting a workflow up and then almost never,
// and permanent reorder arrows on every tab would clutter the primary
// navigation for the 99% of visits that are just switching tabs.
//
// Sub-sections are one level deep and render as a second row under their
// parent when that parent is selected. Deeper nesting would turn a tab bar
// into a tree widget, which is a different component and a different
// navigation model; the cap is enforced in lib/summaries/hierarchy.ts.
export function SectionManager({ activeSectionId, onSelect }: SectionManagerProps) {
  const sections = useAtlasStore((s) => s.summarySections);
  const summaries = useAtlasStore((s) => s.summaries);
  const addSection = useAtlasStore((s) => s.addSummarySection);
  const updateSection = useAtlasStore((s) => s.updateSummarySection);
  const deleteSection = useAtlasStore((s) => s.deleteSummarySection);
  const reorderSections = useAtlasStore((s) => s.reorderSummarySections);

  const [managing, setManaging] = useState(false);
  const [adding, setAdding] = useState<{ parentId?: string } | null>(null);
  const [name, setName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const tree = useMemo(() => buildSectionTree(sections), [sections]);

  // Counts roll up: a parent tab shows everything filed under it *and* its
  // sub-sections, because a parent whose own count is 0 while its children
  // hold thirty notes reads as empty.
  const countFor = (sectionId: string | null): number => {
    if (sectionId === null) return summaries.filter((s) => !s.sectionId).length;
    const ids = new Set(sectionAndDescendants(sections, sectionId));
    return summaries.filter((s) => s.sectionId && ids.has(s.sectionId)).length;
  };

  const activeRoot = useMemo(() => {
    if (!activeSectionId) return null;
    return (
      tree.find((node) => node.section.id === activeSectionId) ??
      tree.find((node) => node.children.some((c) => c.id === activeSectionId)) ??
      null
    );
  }, [tree, activeSectionId]);

  async function submitAdd() {
    const trimmed = name.trim();
    if (!trimmed) return;
    await addSection({ name: trimmed, parentId: adding?.parentId }).catch(() => {});
    setName("");
    setAdding(null);
  }

  async function submitRename(sectionId: string) {
    const trimmed = renameValue.trim();
    // An empty rename is a mistake, not a request to clear the name — a
    // nameless tab is unreachable.
    if (trimmed) await updateSection(sectionId, { name: trimmed }).catch(() => {});
    setRenamingId(null);
    setRenameValue("");
  }

  // Moving an existing section under another, or back out to top level.
  // Creating a sub-section was already possible; without this the hierarchy
  // was one-way — you could build the wrong shape but never correct it.
  function reparent(sectionId: string, parentId: string | null) {
    // Guarded even though the picker only offers legal targets: the list is
    // built from a snapshot, and a section that gained a child in another tab
    // between render and click would otherwise be moved to depth two.
    if (wouldExceedDepth(sections, sectionId, parentId)) return;
    updateSection(sectionId, { parentId: parentId ?? undefined }).catch(() => {});
  }

  function togglePin(section: SummarySection) {
    updateSection(section.id, {
      pinnedAt: section.pinnedAt ? undefined : new Date().toISOString(),
    }).catch(() => {});
  }

  function renderTab(section: SummarySection, depth: number) {
    const isActive = activeSectionId === section.id;
    const siblings = depth === 0 ? tree.map((n) => n.section) : (activeRoot?.children ?? []);

    if (renamingId === section.id) {
      return (
        <span className="flex items-center gap-1">
          <input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitRename(section.id);
              if (e.key === "Escape") setRenamingId(null);
            }}
            autoFocus
            aria-label={`שם חדש ל${section.name}`}
            className="focus-ring w-32 rounded-lg border border-hairline-card bg-surface px-2 py-1 text-xs text-foreground"
          />
          <button
            onClick={() => submitRename(section.id)}
            aria-label="שמור שם"
            className="focus-ring rounded p-1 text-muted hover:text-gold-ink"
          >
            <Check size={12} aria-hidden />
          </button>
        </span>
      );
    }

    return (
      <span className="flex items-center">
        <button
          role="tab"
          aria-selected={isActive}
          onClick={() => onSelect(section.id)}
          className={cn(
            "focus-ring flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            isActive
              ? "glass-control glass-control-active text-foreground"
              : "glass-control-hover text-muted hover:text-foreground"
          )}
        >
          {section.pinnedAt && <Pin size={10} className="shrink-0 text-gold-ink" aria-hidden />}
          {section.name}
          <span className="ltr ms-1 tabular-nums text-muted">{countFor(section.id)}</span>
        </button>

        {managing && (
          <span className="flex items-center">
            <button
              onClick={() => reorderSections(section.id, -1)}
              disabled={isFirst(siblings, section.id)}
              aria-label={`הזז את ${section.name} אחורה`}
              className="focus-ring rounded p-1 text-muted transition-colors hover:text-foreground disabled:opacity-30"
            >
              <ChevronRight size={11} aria-hidden />
            </button>
            <button
              onClick={() => reorderSections(section.id, 1)}
              disabled={isLast(siblings, section.id)}
              aria-label={`הזז את ${section.name} קדימה`}
              className="focus-ring rounded p-1 text-muted transition-colors hover:text-foreground disabled:opacity-30"
            >
              <ChevronLeft size={11} aria-hidden />
            </button>
            <button
              onClick={() => {
                setRenamingId(section.id);
                setRenameValue(section.name);
              }}
              aria-label={`שנה שם ל${section.name}`}
              className="focus-ring rounded p-1 text-muted transition-colors hover:text-gold-ink"
            >
              <Pencil size={11} aria-hidden />
            </button>
            <button
              onClick={() => togglePin(section)}
              aria-pressed={Boolean(section.pinnedAt)}
              aria-label={section.pinnedAt ? `בטל נעיצה של ${section.name}` : `נעץ את ${section.name}`}
              className="focus-ring rounded p-1 text-muted transition-colors hover:text-gold-ink"
            >
              {section.pinnedAt ? <PinOff size={11} aria-hidden /> : <Pin size={11} aria-hidden />}
            </button>
            {/* Re-parenting. Offered only where it is legal: a section with
                children of its own has nowhere to go without dragging them
                to depth two, and eligibleParents returns nothing for it. */}
            {(depth === 1 || eligibleParents(sections, section.id).length > 0) && (
              <select
                value={section.parentId ?? ""}
                onChange={(e) => reparent(section.id, e.target.value || null)}
                aria-label={`העבר את ${section.name} למדור אחר`}
                className="focus-ring max-w-[7rem] rounded border border-hairline-card bg-surface px-1 py-0.5 text-[0.65rem] text-muted"
              >
                <option value="">רמה עליונה</option>
                {eligibleParents(sections, section.id).map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            )}

            {/* Only a top-level section can take children — the depth cap. */}
            {depth === 0 && (
              <button
                onClick={() => {
                  setAdding({ parentId: section.id });
                  setName("");
                }}
                aria-label={`הוסף תת-מדור ל${section.name}`}
                className="focus-ring rounded p-1 text-muted transition-colors hover:text-gold-ink"
              >
                <CornerDownLeft size={11} aria-hidden />
              </button>
            )}
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
              aria-label={`מחק את ${section.name}`}
              className={cn(
                "focus-ring rounded p-1 transition-colors",
                confirmingDelete === section.id ? "text-accent-family" : "text-muted hover:text-accent-family"
              )}
            >
              <Trash2 size={11} aria-hidden />
            </button>
          </span>
        )}
      </span>
    );
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

        {tree.map((node) => (
          <Fragment key={node.section.id}>{renderTab(node.section, 0)}</Fragment>
        ))}

        {adding && !adding.parentId ? (
          <span className="flex items-center gap-1">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitAdd();
                if (e.key === "Escape") setAdding(null);
              }}
              placeholder="שם המדור"
              aria-label="שם המדור החדש"
              autoFocus
              className="focus-ring w-32 rounded-lg border border-hairline-card bg-surface px-2 py-1 text-xs text-foreground placeholder:text-muted"
            />
            <button onClick={submitAdd} aria-label="הוסף מדור" className="focus-ring rounded p-1 text-muted hover:text-gold-ink">
              <Check size={12} aria-hidden />
            </button>
            <button onClick={() => setAdding(null)} aria-label="בטל" className="focus-ring rounded p-1 text-muted hover:text-foreground">
              <X size={12} aria-hidden />
            </button>
          </span>
        ) : (
          <button
            onClick={() => {
              setAdding({});
              setName("");
            }}
            className="glass-control-hover focus-ring flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
          >
            <Plus size={12} aria-hidden />
            מדור
          </button>
        )}

        <button
          onClick={() => {
            setManaging((v) => !v);
            setConfirmingDelete(null);
            setRenamingId(null);
          }}
          className="focus-ring ms-auto rounded-lg px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
        >
          {managing ? "סיום" : "ארגן"}
        </button>
      </div>

      {/* Sub-sections of whichever top-level section is in play. Shown only
          then — rendering every section's children at once would put the
          whole tree in the tab bar, which is the thing the depth cap exists
          to avoid. */}
      {activeRoot && activeRoot.children.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 ps-4" role="tablist" aria-label={`תתי-מדורים ב${activeRoot.section.name}`}>
          {activeRoot.children.map((child) => (
            <Fragment key={child.id}>{renderTab(child, 1)}</Fragment>
          ))}
        </div>
      )}

      {adding?.parentId && (
        <div className="flex items-center gap-1 ps-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitAdd();
              if (e.key === "Escape") setAdding(null);
            }}
            placeholder="שם תת-המדור"
            aria-label="שם תת-המדור החדש"
            autoFocus
            className="focus-ring w-36 rounded-lg border border-hairline-card bg-surface px-2 py-1 text-xs text-foreground placeholder:text-muted"
          />
          <button onClick={submitAdd} aria-label="הוסף תת-מדור" className="focus-ring rounded p-1 text-muted hover:text-gold-ink">
            <Check size={12} aria-hidden />
          </button>
          <button onClick={() => setAdding(null)} aria-label="בטל" className="focus-ring rounded p-1 text-muted hover:text-foreground">
            <X size={12} aria-hidden />
          </button>
        </div>
      )}

      {managing && confirmingDelete && (
        // Says what deletion actually does. Users reasonably assume removing
        // a category removes its contents; it does not, and saying so is what
        // makes the button safe to press.
        <p className="text-xs text-muted">
          מחיקת מדור לא מוחקת את הסיכומים שבו — הם יחזרו לרשימה הכללית, ותתי-המדורים יעלו לרמה העליונה. לחץ שוב כדי לאשר.
        </p>
      )}
    </div>
  );
}
