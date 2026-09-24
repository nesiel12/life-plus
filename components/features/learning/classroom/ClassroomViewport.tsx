"use client";

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Settings2 } from "lucide-react";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { LessonViewport } from "@/components/features/learning/LessonViewport";
import { SyllabusSidebar } from "@/components/features/learning/classroom/SyllabusSidebar";
import { ClassroomNavBar } from "@/components/features/learning/classroom/ClassroomNavBar";
import { useFocusTrap } from "@/components/features/learning/lab/useFocusTrap";
import { getAdjacentStepId } from "@/lib/learning/classroomNav";
import { topicProgress, topicXp } from "@/lib/learning/xp";
import { cn } from "@/lib/utils";
import type { LearningResource, LearningTopic } from "@/types";

interface ClassroomViewportProps {
  topic: LearningTopic;
  resources: readonly LearningResource[];
  initialStepId: string;
  /** "חזור למעבדה" — closes the whole stack (TopicCanvasModal's own onClose), not just the classroom: once entered, the classroom supersedes the checklist rather than sitting in front of it. */
  onClose: () => void;
}

// Above TopicCanvasModal's z-[120], below PioneerProfileDrawer's 132 and
// EmbeddedArticleReader's 135 — both still open from inside the lesson
// content this viewport hosts, unchanged, and need to stack above it.
const CLASSROOM_Z_INDEX = "z-[126]";

/**
 * The full-screen Interactive Masterclass Classroom — replaces
 * MasterclassLessonDrawer's modal-over-modal with the lesson as the primary
 * surface: a collapsible syllabus rail to switch steps, the lesson content
 * itself (LessonViewport, unchanged internals, re-grouped into four zones),
 * and a fixed bottom bar that drives completion and step-to-step movement.
 */
export function ClassroomViewport({ topic, resources, initialStepId, onClose }: ClassroomViewportProps) {
  const [activeStepId, setActiveStepId] = useState(initialStepId);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Its own modal layer: without this, Tab was pulled back to the topic canvas
  // hidden underneath (that canvas's trap only knew about its own panel).
  const rootRef = useRef<HTMLDivElement>(null);
  useFocusTrap(rootRef, true, onClose);

  const activeResource = useMemo(() => resources.find((r) => r.id === activeStepId) ?? resources[0], [resources, activeStepId]);
  const prevStepId = activeResource ? getAdjacentStepId(resources, activeResource.id, "prev") : null;
  const nextStepId = activeResource ? getAdjacentStepId(resources, activeResource.id, "next") : null;

  const progress = topicProgress(resources);
  const xp = topicXp(resources);

  if (!activeResource) return null;

  return createPortal(
    <div ref={rootRef} role="dialog" aria-modal="true" aria-label={`שיעור אמן: ${topic.title}`} dir="rtl" className={cn("fixed inset-0 flex flex-col bg-background", CLASSROOM_Z_INDEX)}>
      <header className="flex items-center gap-3 border-b border-hairline-card px-4 py-3 sm:px-6">
        <button
          onClick={onClose}
          className="focus-ring flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-fill-subtle hover:text-foreground"
        >
          <ArrowRight size={16} aria-hidden />
          חזור למעבדה
        </button>

        <div className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-foreground sm:text-base">
          {topic.title}
          <span className="ms-2 text-xs font-normal text-muted">
            (XP {xp} · {Math.round(progress.fraction * 100)}% הושלם)
          </span>
        </div>

        <ProgressRing value={progress.fraction} size={32} stroke={3} color="var(--accent-learning)" label={`${progress.done} מתוך ${progress.total} שלבים הושלמו`} />

        <button
          onClick={() => setSettingsOpen((v) => !v)}
          aria-pressed={settingsOpen}
          aria-label="התאם אישית"
          className={cn(
            "focus-ring flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm font-medium transition-colors",
            settingsOpen ? "bg-accent-learning/15 text-accent-learning" : "text-muted hover:bg-fill-subtle hover:text-foreground"
          )}
        >
          <Settings2 size={16} aria-hidden />
          <span className="hidden sm:inline">התאם אישית</span>
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <SyllabusSidebar
          resources={resources}
          activeStepId={activeResource.id}
          onSelectStep={(id) => {
            setActiveStepId(id);
            setSettingsOpen(false);
          }}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
        />

        <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
          <div className="mx-auto max-w-3xl">
            <LessonViewport
              key={activeResource.id}
              topic={topic}
              resource={activeResource}
              settingsOpen={settingsOpen}
              onCloseSettings={() => setSettingsOpen(false)}
            />
          </div>
        </main>
      </div>

      <ClassroomNavBar
        resource={activeResource}
        hasPrev={prevStepId !== null}
        hasNext={nextStepId !== null}
        onPrev={() => prevStepId && setActiveStepId(prevStepId)}
        onNext={() => nextStepId && setActiveStepId(nextStepId)}
      />
    </div>,
    document.body
  );
}
