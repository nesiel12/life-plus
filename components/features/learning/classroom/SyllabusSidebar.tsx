"use client";

import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { RESOURCE_ICON } from "@/components/features/learning/lab/labels";
import { xpForResource } from "@/lib/learning/xp";
import { cn } from "@/lib/utils";
import type { LearningResource } from "@/types";

interface SyllabusSidebarProps {
  resources: readonly LearningResource[];
  activeStepId: string;
  onSelectStep: (id: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

/**
 * The classroom's side timeline — the checklist SyllabusQuest.tsx already
 * shows inside TopicCanvasModal, reshaped as a rail the person switches
 * steps from instead of a list they tick off. Every row stays clickable
 * regardless of status — 🟢/🔵/⚪ are orientation, not a gate (confirmed:
 * nothing else in this app's syllabus locks a step behind an earlier one).
 */
export function SyllabusSidebar({ resources, activeStepId, onSelectStep, collapsed, onToggleCollapsed }: SyllabusSidebarProps) {
  return (
    <aside dir="rtl" className={cn("flex shrink-0 flex-col border-e border-hairline-card bg-fill-subtle/30 transition-[width] duration-200", collapsed ? "w-14" : "w-64")}>
      <div className={cn("flex items-center border-b border-hairline-card p-2", collapsed ? "justify-center" : "justify-between px-3 py-2.5")}>
        {!collapsed && <span className="text-xs font-semibold text-muted">מסלול הלימוד</span>}
        <button
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "הרחב את הסרגל" : "כווץ את הסרגל"}
          className="focus-ring grid size-7 place-items-center rounded-full text-muted transition-colors hover:bg-fill-subtle hover:text-foreground"
        >
          {collapsed ? <ChevronsLeft size={14} aria-hidden /> : <ChevronsRight size={14} aria-hidden />}
        </button>
      </div>

      <ol className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-1.5">
        {resources.map((resource, index) => {
          const isActive = resource.id === activeStepId;
          const Icon = RESOURCE_ICON[resource.type];
          const dotColor = resource.isCompleted ? "bg-accent-learning" : isActive ? "bg-accent-faith" : "bg-hairline-card";

          return (
            <li key={resource.id}>
              <button
                onClick={() => onSelectStep(resource.id)}
                aria-current={isActive ? "step" : undefined}
                title={collapsed ? resource.title : undefined}
                className={cn(
                  "focus-ring flex w-full items-center gap-2 rounded-xl px-2 py-2 text-start text-xs transition-colors",
                  isActive ? "bg-accent-learning/15 text-foreground" : "text-muted hover:bg-fill-subtle hover:text-foreground",
                  collapsed && "justify-center"
                )}
              >
                <span aria-hidden className={cn("size-2 shrink-0 rounded-full", dotColor)} />
                {collapsed ? (
                  <Icon size={14} aria-hidden />
                ) : (
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {index + 1}. {resource.title}
                    </span>
                    <span className="text-[10px] text-muted">
                      {resource.isCompleted ? "✓ הושלם" : `+${xpForResource(resource.type)} XP`}
                    </span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
