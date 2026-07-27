"use client";

import { motion } from "framer-motion";
import { BookOpen, GraduationCap, Headphones, NotebookPen, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type TorahTab = "books" | "rabbis" | "shiurim" | "summaries";

const TABS: { key: TorahTab; label: string; icon: LucideIcon }[] = [
  { key: "books", label: "ספרים", icon: BookOpen },
  { key: "rabbis", label: "רבנים", icon: GraduationCap },
  { key: "shiurim", label: "שיעורים", icon: Headphones },
  { key: "summaries", label: "סיכומים", icon: NotebookPen },
];

// The Torah Space's own category switcher — same active-pill mechanics as
// Sidebar's NavLink (shared layoutId-animated background), scoped to this
// page and always in --accent-faith since every surface on this page is
// the "faith" life area already.
export function TorahTabs({ active, onChange }: { active: TorahTab; onChange: (tab: TorahTab) => void }) {
  return (
    <div role="tablist" aria-label="קטגוריות מרחב תורה" className="mb-8 flex flex-wrap gap-2">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={cn(
              "focus-ring relative flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm transition-colors",
              isActive ? "text-accent-faith" : "text-muted hover:text-foreground"
            )}
          >
            {isActive && (
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
            )}
            <Icon size={15} className="relative shrink-0" aria-hidden />
            <span className="relative">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
