// The lesson shapes the API returns and the pages render. Client-safe.

import type { TranscriptLine } from "@/lib/torah/lessons/transcript";

export type LessonStatus = "uploading" | "pending" | "transcribing" | "analyzing" | "ready" | "failed";
export type LessonKind = "audio" | "youtube" | "pdf";

export interface LessonProgressView {
  phase: "waiting" | "transcribe" | "analyze" | "write" | "done";
  windowsDone: number;
  windowsTotal: number;
  /** 0..1 across the whole pipeline, for the progress bar. */
  fraction: number;
  pausedUntil?: string;
  pauseReason?: string;
  lastError?: string;
  source?: "captions" | "gemini";
}

export interface LessonSummary {
  id: string;
  title: string;
  kind: LessonKind;
  status: LessonStatus;
  error: string | null;
  sourceUrl: string | null;
  speaker: string | null;
  durationSeconds: number | null;
  lessonDate: string;
  createdAt: string;
  bookId: string | null;
  rabbiId: string | null;
  summary: string | null;
  progress: LessonProgressView;
}

export interface LessonChapterView {
  id: string;
  startSeconds: number;
  endSeconds: number | null;
  title: string;
  summary: string | null;
}

export interface LessonSourceView {
  id: string;
  rawCitation: string;
  reference: string | null;
  heRef: string | null;
  kind: "verse" | "talmud" | "halacha" | "book" | "other";
  quotedText: string | null;
  sefariaRef: string | null;
  sefariaIndex: string | null;
  heIndexTitle: string | null;
  bookId: string | null;
  atSeconds: number | null;
  confidence: number;
  mentions: number;
}

export interface LearningChunkView {
  id: string;
  ordinal: number;
  title: string;
  body: string;
  startSeconds: number | null;
  endSeconds: number | null;
  completedAt: string | null;
}

export interface LessonDetail extends LessonSummary {
  keyPoints: string[];
  mediaUrl: string | null;
  knowledgeEntryId: string | null;
  transcript: TranscriptLine[];
  transcriptProvider: string | null;
  chapters: LessonChapterView[];
  sources: LessonSourceView[];
  chunks: LearningChunkView[];
}

export interface PracticeQuestionView {
  id: string;
  kind: "scenario" | "application" | "recall" | "compare";
  prompt: string;
  difficulty: number;
  /** Revealed only once the user has answered. */
  modelAnswer: string | null;
  rubric: { criterion: string; weight: number }[] | null;
  latestAttempt: PracticeAttemptView | null;
}

export interface PracticeAttemptView {
  id: string;
  answer: string;
  score: number | null;
  feedback: string | null;
  rubricResults: { criterion: string; met: boolean; note: string }[];
  createdAt: string;
}

export interface FlashcardView {
  id: string;
  front: string;
  back: string;
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
  lapses: number;
  dueAt: string;
  lessonId: string | null;
  chunkId: string | null;
}
