import type { CourseModule, QuizQuestion } from "@/lib/ai/courseModule";

// Turns a generated course module into an ordered list of stages.
//
// The learning module used to present a whole course as one long scroll,
// with progress tracked by ticking checkboxes that sat beside the material
// rather than in it. That asks the learner to do the bookkeeping: read this,
// remember to tick it, scroll on. A stage cursor moves the bookkeeping into
// the act of reading — "next" is both the navigation and the progress.
//
// Pure, so the shape of a course (what counts as a stage, what order they
// come in, what the last one is) is testable without generating one.

export type CourseStage =
  | { kind: "intro"; title: string; body: string }
  | { kind: "section"; heading: string; body: string }
  | { kind: "takeaways"; items: string[] }
  | { kind: "quiz"; questions: QuizQuestion[] };

export interface StageMeta {
  stage: CourseStage;
  /** 0-based position. */
  index: number;
  /** How many stages the course has in total. */
  total: number;
  isFirst: boolean;
  isLast: boolean;
}

/**
 * The stages of a course, in reading order.
 *
 * Empty parts are omitted rather than rendered blank: a module whose model
 * returned no takeaways should not cost the learner a "next" press to walk
 * past an empty screen.
 */
export function buildStages(module: CourseModule): CourseStage[] {
  const stages: CourseStage[] = [{ kind: "intro", title: module.title, body: module.intro }];

  for (const section of module.sections ?? []) {
    if (!section.heading?.trim() && !section.body?.trim()) continue;
    stages.push({ kind: "section", heading: section.heading, body: section.body });
  }

  const takeaways = (module.keyTakeaways ?? []).filter((item) => item.trim().length > 0);
  if (takeaways.length > 0) stages.push({ kind: "takeaways", items: takeaways });

  const quiz = module.quiz ?? [];
  if (quiz.length > 0) stages.push({ kind: "quiz", questions: quiz });

  return stages;
}

/** Keeps a cursor inside the course however it is nudged. */
export function clampStage(index: number, total: number): number {
  if (total <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), total - 1);
}

export function stageMeta(stages: CourseStage[], index: number): StageMeta | null {
  if (stages.length === 0) return null;
  const clamped = clampStage(index, stages.length);
  return {
    stage: stages[clamped],
    index: clamped,
    total: stages.length,
    isFirst: clamped === 0,
    isLast: clamped === stages.length - 1,
  };
}

/** What the progress rail calls each stage. */
export function stageLabel(stage: CourseStage): string {
  switch (stage.kind) {
    case "intro":
      return "פתיחה";
    case "section":
      return stage.heading;
    case "takeaways":
      return "עיקרי הדברים";
    case "quiz":
      return "בוחן";
  }
}

/**
 * Fraction of the course read, 0-1.
 *
 * Measured by stages *completed*, so arriving at the first stage is 0 rather
 * than a fifth of the way through a five-stage course — telling someone they
 * have made progress before they have read anything is the kind of small lie
 * that makes a progress bar worthless.
 */
export function stageProgress(index: number, total: number): number {
  if (total <= 1) return index > 0 ? 1 : 0;
  return clampStage(index, total) / (total - 1);
}
