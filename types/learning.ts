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
  /** Hebrew, RTL — an optional witty line for a wrong answer, softening the miss. */
  funnyDistractor?: string;
}

export interface LessonMemeData {
  imageUrl?: string;
  /** Hebrew, RTL. */
  jokeText: string;
  funnyQuizAnswers?: string[];
}

export interface LessonVideoChapter {
  /** Seconds from the start of the video. */
  time: number;
  /** Hebrew, RTL. */
  label: string;
}

export interface LessonInAppMedia {
  youtubeVideoId?: string;
  videoChapters?: LessonVideoChapter[];
  audioSnippets?: string[];
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
