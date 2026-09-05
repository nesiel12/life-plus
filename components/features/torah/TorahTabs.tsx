"use client";

import { motion } from "framer-motion";
import { BookOpen, GraduationCap, Headphones, NotebookPen, Plus, type LucideIcon } from "lucide-react";
import type { SummarySection } from "@/types";
import { sorted } from "@/lib/summaries/ordering";
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
  onAddSection: () => void;
}

// The Torah Space's category switcher: four built-in tabs plus the user's
// own sections, which sit in the same bar rather than a separate row —
// a custom section is a peer of Books and Rabbis, not a sub-navigation.
//
// The active pill keeps its shared layoutId animation and the faith accent;
// the glass comes from .glass-control per the standing UI constraint that
// navigation gets the frost and reading surfaces do not.
export function TorahTabs({ active, onChange, sections, onAddSection }: TorahTabsProps) {
  const ordered = sorted(sections);

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

      {ordered.length > 0 && <span className="mx-1 h-5 w-px bg-hairline-card" aria-hidden />}

      {ordered.map((section) => {
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
            <span className="relative">{section.name}</span>
          </button>
        );
      })}

      <button
        onClick={onAddSection}
        aria-label="הוסף מדור חדש"
        className="glass-control-hover focus-ring flex items-center gap-1 rounded-xl px-3 py-2 text-sm text-muted transition-colors hover:text-foreground"
      >
        <Plus size={14} aria-hidden />
        מדור
      </button>
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
