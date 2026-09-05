"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, Check, GraduationCap, Headphones, NotebookPen, Pin, Plus, X, type LucideIcon } from "lucide-react";
import type { SummarySection } from "@/types";
import { buildSectionTree } from "@/lib/summaries/hierarchy";
import { cn } from "@/lib/utils";

export type TorahBuiltinTab = "books" | "rabbis" | "shiurim" | "summaries";

/** A custom section is addressed by its id; built-ins by their key. */
export type TorahTab = TorahBuiltinTab | { sectionId: string };

export function isCustomTab(tab: TorahTab): tab is { sectionId: string } {
  return typeof tab === "object";
}

export function sameTab(a: TorahTab, b: TorahTab): boolean {
  if (isCustomTab(a) && isCustomTab(b)) return a.sectionId === b.sectionId;
  return a === b;
}

const BUILTIN: { key: TorahBuiltinTab; label: string; icon: LucideIcon }[] = [
  { key: "books", label: "ספרים", icon: BookOpen },
  { key: "rabbis", label: "רבנים", icon: GraduationCap },
  { key: "summaries", label: "סיכומים", icon: NotebookPen },
  { key: "shiurim", label: "שיעורים", icon: Headphones },
];

interface TorahTabsProps {
  active: TorahTab;
  onChange: (tab: TorahTab) => void;
  sections: SummarySection[];
  /** Receives the typed name; the bar owns the input. */
  onAddSection: (name: string) => void;
}

// The Torah Space's category switcher: four built-in tabs plus the user's
// own sections, which sit in the same bar rather than a separate row —
// a custom section is a peer of Books and Rabbis, not a sub-navigation.
//
// The active pill keeps its shared layoutId animation and the faith accent;
// the glass comes from .glass-control per the standing UI constraint that
// navigation gets the frost and reading surfaces do not.
export function TorahTabs({ active, onChange, sections, onAddSection }: TorahTabsProps) {
  // Top-level sections only in the main bar, pinned ones first. Children
  // appear in a second row under whichever parent is in play — putting the
  // whole tree in one bar is exactly what the depth cap exists to prevent.
  const tree = buildSectionTree(sections);

  const [addingName, setAddingName] = useState<string | null>(null);

  function submitAdd() {
    const trimmed = (addingName ?? "").trim();
    if (trimmed) onAddSection(trimmed);
    setAddingName(null);
  }

  const activeRoot = isCustomTab(active)
    ? (tree.find((n) => n.section.id === active.sectionId) ??
       tree.find((n) => n.children.some((c) => c.id === active.sectionId)) ??
       null)
    : null;

  return (
    <div role="tablist" aria-label="קטגוריות מרחב תורה" className="mb-8 flex flex-wrap items-center gap-2">
      {BUILTIN.map((tab) => {
        const Icon = tab.icon;
        const isActive = sameTab(active, tab.key);
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={cn(
              "focus-ring relative flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm transition-colors",
              isActive ? "text-accent-faith" : "glass-control-hover text-muted hover:text-foreground"
            )}
          >
            {isActive && <ActivePill />}
            <Icon size={15} className="relative shrink-0" aria-hidden />
            <span className="relative">{tab.label}</span>
          </button>
        );
      })}

      {tree.length > 0 && <span className="mx-1 h-5 w-px bg-hairline-card" aria-hidden />}

      {tree.map(({ section }) => {
        const isActive = isCustomTab(active) && active.sectionId === section.id;
        return (
          <button
            key={section.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange({ sectionId: section.id })}
            className={cn(
              "focus-ring relative flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm transition-colors",
              isActive ? "text-accent-faith" : "glass-control-hover text-muted hover:text-foreground"
            )}
          >
            {isActive && <ActivePill />}
            {section.pinnedAt && <Pin size={11} className="relative shrink-0 text-gold-ink" aria-hidden />}
            <span className="relative">{section.name}</span>
          </button>
        );
      })}

      {/* An inline field rather than window.prompt. Everything else in this
          app is custom-styled and RTL; a browser dialog is a visible seam,
          and it cannot be dismissed with Escape into the same state. */}
      {addingName !== null ? (
        <span className="flex items-center gap-1">
          <input
            value={addingName}
            onChange={(e) => setAddingName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitAdd();
              if (e.key === "Escape") setAddingName(null);
            }}
            placeholder="שם המדור"
            aria-label="שם המדור החדש"
            autoFocus
            className="focus-ring w-36 rounded-xl border border-hairline-card bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted"
          />
          <button onClick={submitAdd} aria-label="הוסף מדור" className="focus-ring rounded-lg p-1.5 text-muted hover:text-gold-ink">
            <Check size={14} aria-hidden />
          </button>
          <button onClick={() => setAddingName(null)} aria-label="בטל" className="focus-ring rounded-lg p-1.5 text-muted hover:text-foreground">
            <X size={14} aria-hidden />
          </button>
        </span>
      ) : (
        <button
          onClick={() => setAddingName("")}
          aria-label="הוסף מדור חדש"
          className="glass-control-hover focus-ring flex items-center gap-1 rounded-xl px-3 py-2 text-sm text-muted transition-colors hover:text-foreground"
        >
          <Plus size={14} aria-hidden />
          מדור
        </button>
      )}

      {activeRoot && activeRoot.children.length > 0 && (
        <div
          role="tablist"
          aria-label={`תתי-מדורים ב${activeRoot.section.name}`}
          className="flex w-full flex-wrap items-center gap-1.5 ps-2"
        >
          {activeRoot.children.map((child) => {
            const isActive = isCustomTab(active) && active.sectionId === child.id;
            return (
              <button
                key={child.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => onChange({ sectionId: child.id })}
                className={cn(
                  "focus-ring flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs transition-colors",
                  isActive
                    ? "glass-control glass-control-active text-foreground"
                    : "glass-control-hover text-muted hover:text-foreground"
                )}
              >
                {child.pinnedAt && <Pin size={9} className="shrink-0 text-gold-ink" aria-hidden />}
                {child.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ActivePill() {
  return (
    <motion.span
      layoutId="torah-tab-active"
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="absolute inset-0 rounded-xl"
      style={{
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--accent-faith) 20%, transparent), color-mix(in srgb, var(--accent-faith) 6%, transparent))",
        border: "1px solid color-mix(in srgb, var(--accent-faith) 35%, transparent)",
      }}
    />
  );
}
