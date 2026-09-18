import "server-only";

import { readProgress } from "@/lib/torah/lessons/pipeline";
import type {
  FlashcardView,
  LearningChunkView,
  LessonChapterView,
  LessonProgressView,
  LessonSourceView,
  LessonSummary,
  PracticeAttemptView,
  PracticeQuestionView,
} from "@/lib/torah/lessons/types";
import type { Database } from "@/types/database";

type Tables = Database["public"]["Tables"];

// Row → view mapping for the lessons API. The rows carry pipeline internals
// (leases, the Gemini file handle, the raw analysis draft) that never leave
// the server; these functions are the whitelist of what does.

export function toProgressView(row: Tables["lessons"]["Row"]): LessonProgressView {
  const progress = readProgress(row);
  const windowsTotal = progress.windows?.length ?? 0;
  const windowsDone = Math.min(progress.nextWindow ?? 0, windowsTotal);

  const phase: LessonProgressView["phase"] =
    row.status === "ready"
      ? "done"
      : row.status === "transcribing"
        ? "transcribe"
        : row.status === "analyzing"
          ? progress.phase === "write"
            ? "write"
            : "analyze"
          : "waiting";

  // Transcription is most of the wall-clock time, so it gets most of the bar.
  const fraction =
    phase === "done"
      ? 1
      : phase === "transcribe"
        ? 0.05 + 0.75 * (windowsTotal ? windowsDone / windowsTotal : 0)
        : phase === "analyze"
          ? 0.82
          : phase === "write"
            ? 0.93
            : row.status === "failed"
              ? 0
              : 0.02;

  return {
    phase,
    windowsDone,
    windowsTotal,
    fraction,
    pausedUntil: progress.pausedUntil && new Date(progress.pausedUntil) > new Date() ? progress.pausedUntil : undefined,
    pauseReason: progress.pausedUntil && new Date(progress.pausedUntil) > new Date() ? progress.pauseReason : undefined,
    lastError: progress.lastError,
    source: progress.source,
  };
}

export function toLessonSummary(row: Tables["lessons"]["Row"]): LessonSummary {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    status: row.status,
    error: row.error,
    sourceUrl: row.source_url,
    speaker: row.speaker,
    durationSeconds: row.duration_seconds,
    lessonDate: row.lesson_date,
    createdAt: row.created_at,
    bookId: row.book_id,
    rabbiId: row.rabbi_id,
    summary: row.summary,
    progress: toProgressView(row),
  };
}

export function toChapterView(row: Tables["lesson_segments"]["Row"]): LessonChapterView {
  return {
    id: row.id,
    startSeconds: row.start_seconds,
    endSeconds: row.end_seconds,
    title: row.title,
    summary: row.summary,
  };
}

export function toSourceView(row: Tables["lesson_sources"]["Row"]): LessonSourceView {
  return {
    id: row.id,
    rawCitation: row.raw_citation,
    reference: row.normalized_ref,
    heRef: row.he_ref,
    kind: row.source_kind,
    quotedText: row.quoted_text,
    sefariaRef: row.sefaria_ref,
    sefariaIndex: row.sefaria_index,
    heIndexTitle: row.he_index_title,
    bookId: row.resolved_book_id,
    atSeconds: row.at_seconds,
    confidence: row.confidence,
    mentions: row.mentions,
  };
}

export function toChunkView(row: Tables["learning_chunks"]["Row"]): LearningChunkView {
  return {
    id: row.id,
    ordinal: row.ordinal,
    title: row.title,
    body: row.body,
    startSeconds: row.start_seconds,
    endSeconds: row.end_seconds,
    completedAt: row.completed_at,
  };
}

export function toAttemptView(row: Tables["practice_attempts"]["Row"]): PracticeAttemptView {
  const rubric = Array.isArray(row.rubric_results) ? row.rubric_results : [];
  return {
    id: row.id,
    answer: row.answer,
    score: row.score,
    feedback: row.ai_feedback,
    rubricResults: rubric as PracticeAttemptView["rubricResults"],
    createdAt: row.created_at,
  };
}

export function toQuestionView(
  row: Tables["practice_questions"]["Row"],
  latestAttempt: Tables["practice_attempts"]["Row"] | undefined
): PracticeQuestionView {
  const answered = Boolean(latestAttempt);
  return {
    id: row.id,
    kind: row.kind,
    prompt: row.prompt,
    difficulty: row.difficulty,
    // The model answer is the reward for trying, not a crib sheet.
    modelAnswer: answered ? row.model_answer : null,
    rubric: answered ? ((Array.isArray(row.rubric) ? row.rubric : []) as PracticeQuestionView["rubric"]) : null,
    latestAttempt: latestAttempt ? toAttemptView(latestAttempt) : null,
  };
}

export function toFlashcardView(row: Tables["srs_cards"]["Row"]): FlashcardView {
  return {
    id: row.id,
    front: row.front,
    back: row.back,
    repetitions: row.repetitions,
    intervalDays: row.interval_days,
    easeFactor: row.ease_factor,
    lapses: row.lapses,
    dueAt: row.due_at,
    lessonId: row.source_type === "lesson" ? row.source_id : null,
    chunkId: row.chunk_id,
  };
}
