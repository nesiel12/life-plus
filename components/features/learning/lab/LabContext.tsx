"use client";

import { createContext, useContext } from "react";
import type { useLearningAudio } from "@/hooks/useLearningAudio";
import type { Celebration, LabStats } from "@/lib/learning/xp";

export interface Point {
  x: number;
  y: number;
}

/** What the lab's parts need from the hub that hosts them. */
export interface LabApi {
  audio: ReturnType<typeof useLearningAudio>;
  /** XP, level and totals, derived from the topics as they stand. */
  stats: LabStats;
  reduceMotion: boolean;
  /**
   * Reacts to something worth marking: sound, confetti and a floating "+N XP",
   * sized by `kind`. `origin` is where on screen it happened (viewport px).
   */
  celebrate: (kind: Celebration, xp: number, origin?: Point, label?: string) => void;
  openTopic: (topicId: string) => void;
}

export const LabContext = createContext<LabApi | null>(null);

export function useLab(): LabApi {
  const lab = useContext(LabContext);
  if (!lab) throw new Error("useLab must be used inside <LearningHub>");
  return lab;
}

/** The centre of an element's top edge, in viewport px — where a "+XP" should rise from. */
export function originOf(element: Element | null | undefined): Point | undefined {
  const rect = element?.getBoundingClientRect();
  return rect ? { x: rect.left + rect.width / 2, y: rect.top } : undefined;
}
