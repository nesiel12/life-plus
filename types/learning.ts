// The "Interactive Masterclass & Gaming OS" — a distinct sub-domain of the
// Learning Module (app/areas/learning/, components/features/learning/) with
// its own dedicated types file rather than folding into types/index.ts's
// existing LearningTopic/LearningResource: those model the user's own
// syllabus (what they're studying, what they've completed); this models
// AI-generated masterclass CONTENT for one syllabus step — a materially
// different, much richer shape (pioneers, checkpoints, trivia, media) that
// would otherwise bloat the shared file everything else in the store reads.
//
// These are hand-written, readable-at-a-glance interfaces. The runtime
// validation that guarantees data actually matches them lives in
// lib/validations/learning.ts, cross-checked against these very types via
// `z.ZodType<T>` annotations — so the two files can't silently drift apart.

export const USER_AGE_GROUPS = ["KIDS_8_12", "TEENS_13_18", "ADULTS_19_PLUS"] as const;
export type UserAgeGroup = (typeof USER_AGE_GROUPS)[number];

export const TEACHING_MODES = ["STORYTELLING", "PRACTICAL", "ANALOGIES", "SOCRATIC"] as const;
export type TeachingMode = (typeof TEACHING_MODES)[number];

export interface PioneerExternalLink {
  title: string;
  url: string;
  type: "article" | "video" | "audio";
}

/** A key historical figure behind the topic — the "who discovered/built this, and what were they like" section. */
export interface PioneerProfile {
  id: string;
  name: string;
  role: string;
  historicalEra: string;
  /** Hebrew, RTL. */
  bio: string;
  /** Hebrew, RTL. */
  famousQuote: string;
  /** Hebrew, RTL — a funny or surprising biographical detail, not a dry fact. */
  unusualFact: string;
  externalLinks: PioneerExternalLink[];
}

/** A single multiple-choice check dropped inline into the lesson — exactly 4 options, one correct. */
export interface InlineCheckpoint {
  id: string;
  /** Hebrew, RTL. */
  question: string;
  /** Exactly 4 entries, Hebrew RTL — enforced by lib/validations/learning.ts, not just documented here. */
  options: string[];
  /** Index into `options`, 0-3. */
  correctIndex: number;
  /** Hebrew, RTL — shown after answering, right or wrong. */
  explanation: string;
  /**
   * Hebrew, RTL — an optional witty line for a wrong answer, softening the
   * miss. `null`, not an absent property: some providers' structured-output
   * validators (Groq, live-confirmed 2026-09-25) require every property to
   * be present, expressing "optional" as nullable rather than omittable —
   * see lib/validations/learning.ts's matching schema for the full story.
   */
  funnyDistractor: string | null;
}

export interface LessonMemeData {
  /** `null`, not absent — see InlineCheckpoint.funnyDistractor's own comment for why. */
  imageUrl: string | null;
  /** Hebrew, RTL. */
  jokeText: string;
  funnyQuizAnswers: string[] | null;
}

export interface LessonVideoChapter {
  /** Seconds from the start of the video. */
  time: number;
  /** Hebrew, RTL. */
  label: string;
}

export interface LessonInAppMedia {
  /** `null`, not absent — see InlineCheckpoint.funnyDistractor's own comment for why. */
  youtubeVideoId: string | null;
  videoChapters: LessonVideoChapter[] | null;
  audioSnippets: string[] | null;
}

/**
 * One fully-generated masterclass "block" for a syllabus step: the whole
 * lesson, ready to render. What app/api/learning/lesson/generate/route.ts
 * produces (and caches) and components/features/learning/LessonViewport.tsx
 * renders.
 */
export interface LessonBlockContent {
  /** Hebrew, RTL — the dramatic history of how this topic/discovery came to be. */
  originStory: string;
  pioneers: PioneerProfile[];
  /** Hebrew, RTL — Markdown. The deep explanation; may embed code/math. */
  coreContent: string;
  /** Hebrew, RTL — a historical mistake, bug, or disaster tied to the topic. */
  blooperOrDisaster: string;
  /** Hebrew, RTL, each entry a standalone fact. */
  mindBlowingTrivia: string[];
  memeData: LessonMemeData;
  inAppMedia: LessonInAppMedia;
  inlineCheckpoints: InlineCheckpoint[];
}

export interface LessonGenerateRequest {
  topicId: string;
  stepId: string;
  userAgeGroup: UserAgeGroup;
  teachingMode: TeachingMode;
  /** Free text — a specific angle the person wants emphasized ("focus on the math", "keep it short"). */
  customEmphasis?: string;
}

// --- Step brief (the topic canvas's Live Step Content Preview) -----------
//
// A deliberately smaller, faster sibling of LessonBlockContent: what the
// topic canvas renders the moment a step is selected on its timeline. The
// masterclass lesson is the deep dive; this is the "what is this step, what
// do I need to hold in my head, and how do I prove to myself I have it"
// card — summary, concepts, a diagram, active-recall checks, a Feynman
// prompt and one real-world exercise. Cached per (topic, step) in
// learning_step_content; not keyed by age group / teaching mode, because it
// is a neutral study aid rather than a persona-styled lesson.

export interface StepConcept {
  /** Hebrew, RTL — a short term (1-4 words). */
  term: string;
  /** Hebrew, RTL — one or two sentences. */
  definition: string;
  /** Other `term`s from the same brief this one connects to — drawn as edges in the concept graph. */
  relatedTo: string[];
}

export interface StepKeyFigure {
  name: string;
  /** Hebrew, RTL — what they contributed to this step's subject, one sentence. */
  contribution: string;
}

export interface StepProcessStage {
  title: string;
  detail: string;
}

export interface StepComparisonRow {
  label: string;
  /** One cell per entry in StepVisual.comparisonColumns, same order. */
  cells: string[];
}

/**
 * Dual coding: the brief's one visual. `kind` picks which of the two shapes
 * is filled — a flat object rather than a discriminated union because
 * provider structured-output modes handle unions poorly; the unused
 * branch's arrays simply stay empty.
 */
export interface StepVisual {
  kind: "process" | "comparison" | "none";
  title: string;
  processStages: StepProcessStage[];
  comparisonColumns: string[];
  comparisonRows: StepComparisonRow[];
}

/** An inline fill-in-the-blank: `sentence` contains exactly one "___". */
export interface StepRecallItem {
  sentence: string;
  answer: string;
  /** Other spellings/synonyms that should also count as correct. */
  acceptableAnswers: string[];
  hint: string;
}

export interface StepPracticeTask {
  title: string;
  /** Hebrew, RTL — concrete instructions, doable today. */
  instructions: string;
  estimatedMinutes: number;
}

export interface StepBriefContent {
  /** Hebrew, RTL — 2-4 sentences. Also what the narration player reads aloud. */
  summary: string;
  coreConcepts: StepConcept[];
  keyFigures: StepKeyFigure[];
  visual: StepVisual;
  recall: StepRecallItem[];
  /** The concept the learner is asked to explain in their own words (Feynman). */
  feynmanConcept: string;
  practice: StepPracticeTask;
}

export interface StepBriefRequest {
  topicId: string;
  stepId: string;
}
