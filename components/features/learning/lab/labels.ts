import { BookOpen, FileText, Headphones, SquarePlay, Wrench, type LucideIcon } from "lucide-react";
import type { LearningResourceType, LearningTopicStatus } from "@/types";

export const RESOURCE_ICON: Record<LearningResourceType, LucideIcon> = {
  youtube: SquarePlay,
  podcast: Headphones,
  article: FileText,
  equipment: Wrench,
  summary: BookOpen,
};

export const RESOURCE_LABEL: Record<LearningResourceType, string> = {
  youtube: "סרטון",
  podcast: "פודקאסט",
  article: "מאמר",
  equipment: "ציוד",
  summary: "סיכום",
};

export const STATUS_LABEL: Record<LearningTopicStatus, string> = {
  planning: "בתכנון",
  active: "פעיל",
  completed: "הושלם",
};

/** Tapping a status chip moves it to the next: a three-value field needs no editor. */
export const STATUS_CYCLE: Record<LearningTopicStatus, LearningTopicStatus> = {
  planning: "active",
  active: "completed",
  completed: "planning",
};
