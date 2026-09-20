"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BookOpen, Map as MapIcon, MonitorPlay } from "lucide-react";
import { InteractiveVideoLesson } from "@/components/features/learning/InteractiveVideoLesson";
import { SubjectRoadmap } from "@/components/features/learning/SubjectRoadmap";
import { youtubeVideoId } from "@/lib/learning/youtube";
import { cn } from "@/lib/utils";

type Mode = "study" | "video" | "roadmap";

interface StudyModesProps {
  topicId: string;
  topicTitle: string;
  /** The topic's YouTube resource, when it has one. */
  videoUrl?: string;
  /** The existing AI study view. */
  children: ReactNode;
}

/**
 * The study panel's three modes: AI-guided study, the interactive video
 * lesson (when the topic has a video), and the subject roadmap. The active
 * pill slides between modes (shared layout), and each mode cross-fades in.
 */
export function StudyModes({ topicId, topicTitle, videoUrl, children }: StudyModesProps) {
  const reduceMotion = useReducedMotion();
  const videoId = videoUrl ? youtubeVideoId(videoUrl) : null;
  const [mode, setMode] = useState<Mode>("study");

  const modes: { key: Mode; label: string; icon: typeof BookOpen; hidden?: boolean }[] = [
    { key: "study", label: "לימוד עם AI", icon: BookOpen },
    { key: "video", label: "שיעור וידאו אינטראקטיבי", icon: MonitorPlay, hidden: !videoId },
    { key: "roadmap", label: "מפת דרכים", icon: MapIcon },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" aria-label="מצב לימוד" className="flex flex-wrap gap-1 rounded-2xl bg-fill-subtle p-1">
        {modes
          .filter((m) => !m.hidden)
          .map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={mode === key}
              onClick={() => setMode(key)}
              className={cn(
                "focus-ring relative flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm transition-colors",
                mode === key ? "text-foreground" : "text-muted hover:text-foreground"
              )}
            >
              {mode === key && (
                <motion.span
                  layoutId={`study-mode-${topicId}`}
                  className="absolute inset-0 rounded-xl bg-surface shadow-sm"
                  transition={{ type: "spring", visualDuration: 0.3, bounce: 0.15 }}
                />
              )}
              <Icon size={14} className="relative" aria-hidden />
              <span className="relative">{label}</span>
            </button>
          ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={mode}
          role="tabpanel"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {mode === "study" && children}
          {mode === "video" && videoId && videoUrl && (
            <InteractiveVideoLesson videoId={videoId} videoUrl={videoUrl} topicId={topicId} title={topicTitle} />
          )}
          {mode === "roadmap" && <SubjectRoadmap topicId={topicId} topicTitle={topicTitle} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
