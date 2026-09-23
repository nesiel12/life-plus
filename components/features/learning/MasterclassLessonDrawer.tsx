"use client";

import { X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { LessonViewport } from "@/components/features/learning/LessonViewport";
import type { LearningResource, LearningTopic } from "@/types";

interface MasterclassLessonDrawerProps {
  topic: LearningTopic;
  resource: LearningResource;
  onClose: () => void;
}

// A bespoke z-index above TopicCanvasModal's own z-[120] — the same
// precedent TopicCanvasModal itself set against the shared Z_INDEX scale in
// components/ui/Modal.tsx (that scale tops out at z-[80], nowhere near what
// a modal-over-a-modal needs here).
const DRAWER_Z_INDEX = "z-[130]";

/**
 * The masterclass lesson, opened over the topic canvas it was launched from.
 * A second Modal instance rather than inlining LessonViewport into
 * SyllabusQuest's row: a full lesson (origin story, pioneers, deep content,
 * checkpoints) is too much to cram into an already-busy syllabus list, and
 * Modal's own portal/focus-trap/Escape handling is exactly what a real
 * "step out of the topic and into one lesson" moment needs — reused here
 * rather than rebuilt.
 */
export function MasterclassLessonDrawer({ topic, resource, onClose }: MasterclassLessonDrawerProps) {
  return (
    <Modal
      open
      onClose={onClose}
      align="center"
      zIndex={DRAWER_Z_INDEX}
      label={`שיעור אמן: ${resource.title}`}
      panelClassName="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden p-4 sm:p-6"
    >
      <div dir="rtl" className="mb-3 flex items-center justify-between gap-3">
        <h2 className="min-w-0 truncate text-base font-semibold text-foreground">{resource.title}</h2>
        <button onClick={onClose} aria-label="סגור" className="focus-ring grid size-9 shrink-0 place-items-center rounded-full bg-fill-subtle text-muted transition-colors hover:text-foreground">
          <X size={18} aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <LessonViewport topic={topic} resource={resource} />
      </div>
    </Modal>
  );
}
