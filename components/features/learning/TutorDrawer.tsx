"use client";

import { useRef } from "react";
import { motion } from "framer-motion";
import { MessageCircleQuestion, X } from "lucide-react";
import { TutorBox, type TutorPersona } from "@/components/features/learning/TutorBox";
import { useFocusTrap } from "@/components/features/learning/lab/useFocusTrap";
import { useLabReducedMotion } from "@/components/features/learning/lab/useLabMotion";

interface TutorDrawerProps {
  id: string;
  topicTitle: string;
  resourceTitles: readonly string[];
  stepTitle?: string;
  personas: readonly TutorPersona[];
  onClose: () => void;
}

/**
 * "שאל על הנושא" as a slide-over over the topic canvas, instead of a fixed
 * box that left a tall empty column beside the syllabus. A modal layer of its
 * own: focus moves in, Tab stays in, Escape closes it (and only it), focus
 * returns to the button that opened it. Slides on transform only; under
 * reduced motion it fades.
 */
export function TutorDrawer({ id, topicTitle, resourceTitles, stepTitle, personas, onClose }: TutorDrawerProps) {
  const reduce = useLabReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true, onClose);

  return (
    <div className="absolute inset-0 z-20">
      <motion.div aria-hidden className="absolute inset-0 bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.aside
        ref={ref}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        initial={reduce ? { opacity: 0 } : { x: "-100%" }}
        animate={reduce ? { opacity: 1 } : { x: 0 }}
        exit={reduce ? { opacity: 0 } : { x: "-100%" }}
        transition={reduce ? { duration: 0.15 } : { type: "spring", bounce: 0.08, duration: 0.45 }}
        className="absolute inset-y-0 end-0 flex w-full max-w-md flex-col border-s border-hairline-card bg-surface shadow-[0_0_60px_-20px_rgba(0,0,0,0.5)]"
      >
        <header className="flex items-center gap-2 border-b border-hairline-card px-5 py-3">
          <MessageCircleQuestion size={18} className="text-accent-learning" aria-hidden />
          <h3 id={`${id}-title`} className="flex-1 text-base font-semibold text-foreground">
            שאל על הנושא
          </h3>
          <button type="button" onClick={onClose} aria-label="סגור את חלון השאלות" className="focus-ring grid size-11 place-items-center rounded-full text-muted hover:bg-fill-subtle hover:text-foreground">
            <X size={18} aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <TutorBox topicTitle={topicTitle} resourceTitles={resourceTitles} stepTitle={stepTitle} personas={personas} hideHeading />
        </div>
      </motion.aside>
    </div>
  );
}
