import "server-only";

import { YoutubeTranscript } from "youtube-transcript";
import { generateStructuredData, isMediaTranscriptionConfigured, isProviderConfigured, transcribeMediaWindow } from "@/lib/ai";
import { AiQuotaExceededError } from "@/lib/ai/service";
import { deleteGeminiFile, getGeminiFile, uploadGeminiFile, waitForGeminiFileActive } from "@/lib/ai/geminiMedia";
import type { AiActor } from "@/lib/ai/quota";
import { booksRepo } from "@/lib/db/books";
import { kgEdgesRepo } from "@/lib/db/kgEdges";
import { lessonsRepo, lessonSegmentsRepo, lessonSourcesRepo, lessonTranscriptsRepo } from "@/lib/db/lessons";
import { learningChunksRepo } from "@/lib/db/practice";
import { bookTitleKey, hebrewOnly, hebrewProse } from "@/lib/torah/hebrew";
import {
  buildLearningChunks,
  collectCitationCandidates,
  normalizeChapters,
  referenceVariants,
  type CitationCandidate,
  type LessonChapter,
  type ModelCitation,
} from "@/lib/torah/lessons/analysis";
import { MAX_MEDIA_SECONDS } from "@/lib/torah/lessons/media";
import { LESSON_ANALYSIS_SYSTEM_PROMPT, lessonAnalysisSchema } from "@/lib/torah/lessons/prompts";
import { downloadLessonMedia } from "@/lib/torah/lessons/storage";
import {
  appendWindowLines,
  linesToText,
  normalizeCaptions,
  normalizeWindowLines,
  parseStoredLines,
  planWindows,
  transcriptForPrompt,
  windowRangeLabel,
  wordCount,
  type TimeWindow,
  type TranscriptLine,
} from "@/lib/torah/lessons/transcript";
import { sefariaBook, sefariaRefInfo, sefariaText } from "@/lib/torah/sources/providers";
import type { Database, Json } from "@/types/database";

type LessonRow = Database["public"]["Tables"]["lessons"]["Row"];
type LessonUpdate = Database["public"]["Tables"]["lessons"]["Update"];
type BookRow = Database["public"]["Tables"]["books"]["Row"];

// The lessons pipeline: pending → transcribing → analyzing → ready.
//
// Every call to advanceLesson() performs whole STEPS under a lease (see the
// header of 20260918000000_torah_lessons_phase3.sql): one transcription
// window, the analysis call, or writing the analysis out. Each step commits
// its result before the next begins, so a worker killed at any point — a
// serverless timeout, a deploy, a laptop lid — loses at most the step it was
// in, and the next worker continues from the saved cursor.

/** A worker holds a step for at most this long before another may retry it. */
const LEASE_SECONDS = 300;
/** Audio windows: ~10 minutes of speech is a few thousand output tokens. */
const AUDIO_WINDOW_SECONDS = envSeconds("LESSON_AUDIO_WINDOW_SECONDS", 600);
/** Video windows are smaller — a clipped window's video tokens dominate the request. */
const VIDEO_WINDOW_SECONDS = envSeconds("LESSON_VIDEO_WINDOW_SECONDS", 240);

// Window sizes are tunable per deployment (a faster model tier can take longer
// windows; a slow one needs shorter steps to fit its platform deadline).
function envSeconds(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 30 ? value : fallback;
}
/** Consecutive failures of the same step before the lesson is marked failed. */
const MAX_STEP_FAILURES = 3;
/** Audio bitrate assumed when the duration is unknown (128 kbps). */
const ASSUMED_AUDIO_BYTES_PER_SECOND = 16_000;
const ANALYSIS_TIMEOUT_MS = 150_000;

export interface LessonProgress {
  phase?: "transcribe" | "analyze" | "write";
  /** How the transcript is being produced. */
  source?: "captions" | "gemini";
  windows?: TimeWindow[];
  nextWindow?: number;
  /** True when the windows were planned from an estimated duration. */
  estimatedDuration?: boolean;
  /** Consecutive windows that returned no speech — ends an estimated plan early. */
  emptyWindows?: number;
  geminiFile?: { name: string; uri: string; mimeType: string; expiresAt?: string };
  /** The analysis model's output, kept between the analyze and write steps. */
  analysis?: {
    summary: string;
    keyPoints: string[];
    chapters: { start: string; title: string; summary: string }[];
    citations: ModelCitation[];
  };
  pausedUntil?: string;
  pauseReason?: string;
  lastError?: string;
}

export function readProgress(row: Pick<LessonRow, "progress">): LessonProgress {
  return (row.progress && typeof row.progress === "object" && !Array.isArray(row.progress)
    ? row.progress
    : {}) as LessonProgress;
}

function actorFor(row: LessonRow): AiActor {
  // The user's own quota: the pipeline does work the user asked for, whether
  // the step runs in their request or in the nightly sweep.
  return { kind: "user", userId: row.user_id };
}

class LessonStepError extends Error {
  /** Hebrew, shown in the UI. */
  readonly userMessage: string;
  /** Retrying cannot help (a private video, an empty file). */
  readonly permanent: boolean;
  constructor(userMessage: string, permanent = false) {
    super(userMessage);
    this.userMessage = userMessage;
    this.permanent = permanent;
  }
}

interface StepResult {
  patch: LessonUpdate;
  /** True when the lesson reached a state no worker should continue. */
  finished?: boolean;
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

export interface AdvanceOptions {
  /** Scope the claim to one user; null for the cross-user sweep. */
  userId: string | null;
  /** Stop starting new steps after this long. A running step always finishes. */
  budgetMs: number;
}

export interface AdvanceResult {
  steps: number;
  status: LessonRow["status"] | null;
}

/**
 * Runs as many steps as fit in the budget. Never throws: a failed step is
 * recorded on the row (and eventually marks the lesson failed), because the
 * callers — a cron sweep, an after() hook — have nobody to report an
 * exception to.
 */
export async function advanceLesson(lessonId: string, options: AdvanceOptions): Promise<AdvanceResult> {
  const deadline = Date.now() + options.budgetMs;
  let steps = 0;
  let status: LessonRow["status"] | null = null;

  while (Date.now() < deadline) {
    let row: LessonRow | null;
    try {
      row = await lessonsRepo.claimStep(lessonId, options.userId, LEASE_SECONDS);
    } catch (err) {
      console.error("[lessons] claim failed:", err);
      break;
    }
    if (!row) break;

    const progress = readProgress(row);
    try {
      const result = await runStep(row, progress);
      const saved = await lessonsRepo.release(row.user_id, row.id, { attempts: 0, ...result.patch });
      steps++;
      status = saved.status;
      if (result.finished || saved.status === "ready" || saved.status === "failed") break;
    } catch (err) {
      status = await recordFailure(row, progress, err);
      break;
    }
  }

  return { steps, status };
}

async function recordFailure(row: LessonRow, progress: LessonProgress, err: unknown): Promise<LessonRow["status"]> {
  if (err instanceof AiQuotaExceededError) {
    // Not a failure: the user has used today's AI allowance. The lesson waits
    // and continues on its own when the allowance resets.
    await lessonsRepo
      .release(row.user_id, row.id, {
        progress: {
          ...progress,
          pausedUntil: err.resetAt.toISOString(),
          pauseReason: "הגעת למכסת ה-AI היומית. העיבוד ימשיך אוטומטית כשהמכסה תתחדש.",
        } as unknown as Json,
      })
      .catch(() => undefined);
    return row.status;
  }

  const message = err instanceof LessonStepError ? err.userMessage : "שלב בעיבוד נכשל.";
  const permanent = err instanceof LessonStepError && err.permanent;
  const attempts = row.attempts + 1;
  console.error(`[lessons] step failed for ${row.id} (attempt ${attempts}):`, err);

  if (permanent || attempts >= MAX_STEP_FAILURES) {
    await lessonsRepo
      .release(row.user_id, row.id, {
        status: "failed",
        error: permanent ? message : `${message} ניסינו ${attempts} פעמים — אפשר לנסות שוב.`,
        attempts,
        progress: { ...progress, lastError: message } as unknown as Json,
      })
      .catch(() => undefined);
    return "failed";
  }

  await lessonsRepo
    .release(row.user_id, row.id, { attempts, progress: { ...progress, lastError: message } as unknown as Json })
    .catch(() => undefined);
  return row.status;
}

async function runStep(row: LessonRow, progress: LessonProgress): Promise<StepResult> {
  if (row.status === "pending") return startLesson(row, progress);
  if (row.status === "transcribing") return transcribeNextWindow(row, progress);
  if (row.status === "analyzing") {
    return progress.phase === "write" && progress.analysis ? writeAnalysis(row, progress) : analyzeLesson(row, progress);
  }
  return { patch: {}, finished: true };
}

// ---------------------------------------------------------------------------
// Step 1 — plan the transcription
// ---------------------------------------------------------------------------

async function startLesson(row: LessonRow, progress: LessonProgress): Promise<StepResult> {
  const fresh: LessonProgress = { ...progress, pausedUntil: undefined, pauseReason: undefined, lastError: undefined };

  if (row.kind === "youtube") {
    const captions = await fetchCaptions(row.source_url ?? "", row.duration_seconds);
    if (captions.length > 0) {
      await saveTranscript(row, captions, "youtube-captions");
      return {
        patch: {
          status: "analyzing",
          duration_seconds: row.duration_seconds ?? captions[captions.length - 1].end,
          progress: { ...fresh, phase: "analyze", source: "captions" } as unknown as Json,
        },
      };
    }
    if (!isMediaTranscriptionConfigured()) {
      throw new LessonStepError("לסרטון אין כתוביות, ואין מפתח Gemini מחובר לתמלול.", true);
    }
    if (!row.duration_seconds) {
      throw new LessonStepError("לא ניתן לקבוע את אורך הסרטון. ודא שהוא ציבורי ונסה שוב.", true);
    }
    return {
      patch: {
        status: "transcribing",
        progress: {
          ...fresh,
          phase: "transcribe",
          source: "gemini",
          windows: planWindows(Math.min(row.duration_seconds, MAX_MEDIA_SECONDS), VIDEO_WINDOW_SECONDS),
          nextWindow: 0,
        } as unknown as Json,
      },
    };
  }

  if (row.kind === "audio") {
    if (!isMediaTranscriptionConfigured()) {
      throw new LessonStepError("אין מפתח Gemini מחובר, ולכן אי אפשר לתמלל קבצי שמע.", true);
    }
    if (!row.storage_path) throw new LessonStepError("קובץ השמע לא נמצא.", true);

    const estimated = !row.duration_seconds;
    const duration = row.duration_seconds ?? Math.ceil((row.media_size_bytes ?? 0) / ASSUMED_AUDIO_BYTES_PER_SECOND);
    if (duration <= 0) throw new LessonStepError("קובץ השמע ריק.", true);

    const geminiFile = await uploadAudioToGemini(row);
    return {
      patch: {
        status: "transcribing",
        progress: {
          ...fresh,
          phase: "transcribe",
          source: "gemini",
          geminiFile,
          windows: planWindows(Math.min(duration, MAX_MEDIA_SECONDS), AUDIO_WINDOW_SECONDS),
          nextWindow: 0,
          estimatedDuration: estimated,
          emptyWindows: 0,
        } as unknown as Json,
      },
    };
  }

  throw new LessonStepError("סוג השיעור הזה עדיין לא נתמך בעיבוד אוטומטי.", true);
}

async function fetchCaptions(url: string, durationSeconds: number | null): Promise<TranscriptLine[]> {
  if (!url) return [];
  // Hebrew first under both of its language codes, then whatever the video has.
  for (const lang of ["iw", "he", undefined]) {
    try {
      const segments = await YoutubeTranscript.fetchTranscript(url, lang ? { lang } : undefined);
      const lines = normalizeCaptions(segments, durationSeconds);
      if (lines.length > 0) return lines;
    } catch {
      // No captions in this language (or none at all) — try the next option.
    }
  }
  return [];
}

async function uploadAudioToGemini(row: LessonRow): Promise<NonNullable<LessonProgress["geminiFile"]>> {
  let bytes: Uint8Array;
  try {
    bytes = await downloadLessonMedia(row.storage_path!);
  } catch {
    throw new LessonStepError("קובץ השמע לא נמצא באחסון. ייתכן שההעלאה לא הושלמה.", true);
  }
  const uploaded = await uploadGeminiFile(bytes, row.media_mime ?? "audio/mpeg", `lesson-${row.id}`);
  const active = uploaded.state === "ACTIVE" ? uploaded : await waitForGeminiFileActive(uploaded.name);
  return { name: active.name, uri: active.uri, mimeType: active.mimeType, expiresAt: active.expirationTime };
}

// ---------------------------------------------------------------------------
// Step 2 — transcribe one window
// ---------------------------------------------------------------------------

async function transcribeNextWindow(row: LessonRow, progress: LessonProgress): Promise<StepResult> {
  const windows = progress.windows ?? [];
  const index = progress.nextWindow ?? 0;

  if (index >= windows.length) {
    return finishTranscription(row, progress);
  }

  let geminiFile = progress.geminiFile;
  if (row.kind === "audio") {
    // Files API uploads expire after 48 hours; a lesson paused on quota for
    // two days needs a fresh one.
    const expiresSoon = !geminiFile?.expiresAt || new Date(geminiFile.expiresAt).getTime() < Date.now() + 10 * 60_000;
    if (!geminiFile || expiresSoon || !(await getGeminiFile(geminiFile.name).catch(() => null))) {
      geminiFile = await uploadAudioToGemini(row);
    }
  }

  const window = windows[index];
  const source =
    row.kind === "youtube"
      ? ({ kind: "youtube", url: row.source_url ?? "" } as const)
      : ({ kind: "file", uri: geminiFile!.uri, mimeType: geminiFile!.mimeType } as const);

  let raw;
  try {
    raw = await transcribeMediaWindow({ source, window: { ...window, ...windowRangeLabel(window) }, actor: actorFor(row) });
  } catch (err) {
    if (err instanceof AiQuotaExceededError) throw err;
    const status = (err as { status?: number }).status;
    if (row.kind === "youtube" && (status === 400 || status === 403 || status === 404)) {
      throw new LessonStepError("Gemini לא הצליח לגשת לסרטון. ודא שהוא ציבורי ולא מוגבל.", true);
    }
    throw new LessonStepError("תמלול קטע מהשיעור נכשל.");
  }

  const lines = normalizeWindowLines(raw, window);
  const existing = parseStoredLines((await lessonTranscriptsRepo.get(row.user_id, row.id))?.lines);
  const merged = appendWindowLines(existing, lines);
  // Saved after EVERY window: this is the resumable part, and it is also what
  // lets the lesson page show the transcript growing while it is processed.
  await saveTranscript(row, merged, "gemini");

  const emptyWindows = lines.length === 0 ? (progress.emptyWindows ?? 0) + 1 : 0;
  const nextWindow = index + 1;
  // An estimated duration can overshoot; two silent windows in a row past the
  // halfway point mean the recording has ended.
  const endedEarly = progress.estimatedDuration && emptyWindows >= 2 && nextWindow > windows.length / 2;

  const nextProgress: LessonProgress = { ...progress, geminiFile, nextWindow, emptyWindows, lastError: undefined };
  if (nextWindow >= windows.length || endedEarly) {
    return finishTranscription(row, nextProgress, merged);
  }
  return { patch: { progress: nextProgress as unknown as Json } };
}

async function finishTranscription(row: LessonRow, progress: LessonProgress, lines?: TranscriptLine[]): Promise<StepResult> {
  const finalLines = lines ?? parseStoredLines((await lessonTranscriptsRepo.get(row.user_id, row.id))?.lines);
  if (finalLines.length === 0) {
    throw new LessonStepError("לא נמצא דיבור בשיעור. ודא שהקובץ תקין ושיש בו שמע.", true);
  }
  if (progress.geminiFile) void deleteGeminiFile(progress.geminiFile.name);

  const lastEnd = finalLines[finalLines.length - 1].end;
  return {
    patch: {
      status: "analyzing",
      duration_seconds: progress.estimatedDuration || !row.duration_seconds ? lastEnd : row.duration_seconds,
      progress: { ...progress, phase: "analyze", geminiFile: undefined } as unknown as Json,
    },
  };
}

async function saveTranscript(row: LessonRow, lines: TranscriptLine[], provider: string) {
  const fullText = linesToText(lines);
  await lessonTranscriptsRepo.save({
    lesson_id: row.id,
    user_id: row.user_id,
    full_text: fullText,
    language: "he",
    provider,
    word_count: wordCount(fullText),
    lines: lines as unknown as Json,
  });
}

// ---------------------------------------------------------------------------
// Step 3 — analysis (the model call)
// ---------------------------------------------------------------------------

async function analyzeLesson(row: LessonRow, progress: LessonProgress): Promise<StepResult> {
  const transcript = await lessonTranscriptsRepo.get(row.user_id, row.id);
  const lines = parseStoredLines(transcript?.lines);
  if (lines.length === 0) throw new LessonStepError("התמלול חסר — אי אפשר לנתח את השיעור.", true);

  if (!isProviderConfigured()) {
    // No model: the transcript alone is still a usable lesson, with chunks
    // cut on time. Better a ready lesson without a summary than a failed one.
    return writeAnalysis(row, { ...progress, analysis: { summary: "", keyPoints: [], chapters: [], citations: [] } });
  }

  const object = await generateStructuredData({
    actor: actorFor(row),
    schema: lessonAnalysisSchema,
    system: LESSON_ANALYSIS_SYSTEM_PROMPT,
    prompt: [
      `כותרת השיעור: ${row.title}`,
      row.speaker ? `מרצה / ערוץ: ${row.speaker}` : null,
      "התמלול, עם חותמות זמן:",
      transcriptForPrompt(lines),
    ]
      .filter(Boolean)
      .join("\n"),
    timeoutMs: ANALYSIS_TIMEOUT_MS,
  }).catch((err) => {
    if (err instanceof AiQuotaExceededError) throw err;
    throw new LessonStepError("ניתוח השיעור נכשל.");
  });

  return {
    patch: {
      progress: {
        ...progress,
        phase: "write",
        analysis: {
          summary: object.summary,
          keyPoints: object.keyPoints,
          chapters: object.chapters,
          citations: object.citations,
        },
      } as unknown as Json,
    },
  };
}

// ---------------------------------------------------------------------------
// Step 4 — resolve sources and write everything out
// ---------------------------------------------------------------------------

async function writeAnalysis(row: LessonRow, progress: LessonProgress): Promise<StepResult> {
  const analysis = progress.analysis ?? { summary: "", keyPoints: [], chapters: [], citations: [] };
  const lines = parseStoredLines((await lessonTranscriptsRepo.get(row.user_id, row.id))?.lines);
  const duration = row.duration_seconds ?? (lines.length ? lines[lines.length - 1].end : null);

  const chapters = normalizeChapters(analysis.chapters, duration).map((chapter) => ({
    ...chapter,
    title: hebrewProse(chapter.title) ?? chapter.title,
    summary: hebrewProse(chapter.summary),
  }));
  await lessonSegmentsRepo.replaceForLesson(
    row.user_id,
    row.id,
    chapters.map((chapter) => ({
      user_id: row.user_id,
      lesson_id: row.id,
      start_seconds: chapter.startSeconds,
      end_seconds: chapter.endSeconds,
      title: chapter.title,
      summary: chapter.summary,
      sort_order: chapter.sortOrder,
    }))
  );

  const books = await booksRepo.list(row.user_id);
  const candidates = collectCitationCandidates(lines, analysis.citations);
  const resolved = await resolveCitations(candidates, books);

  await lessonSourcesRepo.replaceForLesson(
    row.user_id,
    row.id,
    resolved.map(({ candidate, info }) => ({
      user_id: row.user_id,
      lesson_id: row.id,
      raw_citation: candidate.raw,
      normalized_ref: hebrewOnly(candidate.reference) ?? null,
      source_kind: candidate.kind,
      quoted_text: info?.quotedText ?? null,
      sefaria_ref: info?.ref ?? null,
      sefaria_index: info?.index ?? null,
      he_ref: info?.heRef ?? null,
      he_index_title: info?.heIndexTitle ?? null,
      resolved_book_id: info?.bookId ?? null,
      at_seconds: candidate.atSeconds,
      confidence: info ? candidate.confidence : Math.min(candidate.confidence, 0.5),
      mentions: candidate.mentions,
    }))
  );

  await writeGraphEdges(row, resolved);

  const drafts = buildLearningChunks(lines, chapters as LessonChapter[], duration);
  await learningChunksRepo.replaceForLesson(
    row.user_id,
    row.id,
    drafts.map((draft) => ({
      user_id: row.user_id,
      lesson_id: row.id,
      ordinal: draft.ordinal,
      title: draft.title,
      body: draft.body,
      start_seconds: draft.startSeconds,
      end_seconds: draft.endSeconds,
    }))
  );

  const keyPoints = analysis.keyPoints.map((p) => hebrewProse(p)).filter((p): p is string => Boolean(p));
  return {
    patch: {
      status: "ready",
      summary: hebrewProse(analysis.summary) ?? null,
      key_points: keyPoints as unknown as Json,
      duration_seconds: duration,
      processed_at: new Date().toISOString(),
      error: null,
      // The analysis draft has been written out; keep the cursor small.
      progress: { source: progress.source } as unknown as Json,
    },
    finished: true,
  };
}

interface ResolvedInfo {
  ref: string;
  index: string;
  heRef?: string;
  heIndexTitle?: string;
  quotedText?: string;
  bookId?: string;
}

// Sefaria is asked about each citation in small parallel batches — fast, and
// polite to a free public API.
const RESOLVE_CONCURRENCY = 5;

async function resolveCitations(candidates: CitationCandidate[], books: BookRow[]) {
  const results: { candidate: CitationCandidate; info: ResolvedInfo | null }[] = [];
  const indexTitles = new Map<string, Promise<string | undefined>>();

  const hebrewTitleOf = (index: string) => {
    if (!indexTitles.has(index)) {
      indexTitles.set(index, sefariaBook(index).then((book) => book?.hebrewTitle).catch(() => undefined));
    }
    return indexTitles.get(index)!;
  };

  for (let i = 0; i < candidates.length; i += RESOLVE_CONCURRENCY) {
    const batch = candidates.slice(i, i + RESOLVE_CONCURRENCY);
    const resolvedBatch = await Promise.all(
      batch.map(async (candidate) => {
        // Sefaria's own parser validates the ref: a daf that does not exist
        // does not resolve, and the citation stays unlinked and low-confidence.
        const refInfo = await resolveReference(candidate);
        if (!refInfo) return { candidate, info: null };
        const [text, heIndexTitle] = await Promise.all([
          sefariaText(refInfo.ref).catch(() => null),
          hebrewTitleOf(refInfo.index),
        ]);
        const info: ResolvedInfo = {
          ref: refInfo.ref,
          index: refInfo.index,
          heRef: text?.hebrewRef,
          heIndexTitle,
          quotedText: text?.hebrew.slice(0, 3).join(" ").slice(0, 700) || undefined,
        };
        info.bookId = matchLibraryBook(info, books)?.id;
        return { candidate, info };
      })
    );
    results.push(...resolvedBatch);
  }
  return results;
}

/** The parser-built ref first, then the spelled-out reference in its variants. */
async function resolveReference(candidate: CitationCandidate) {
  const attempts = candidate.sefariaRef ? [candidate.sefariaRef] : referenceVariants(candidate.reference);
  for (const attempt of attempts) {
    const info = await sefariaRefInfo(attempt).catch(() => null);
    if (info) return info;
  }
  return null;
}

/** The user's book for a resolved citation: same Sefaria work, or the same Hebrew title. */
export function matchLibraryBook(
  info: { index?: string | null; heIndexTitle?: string | null },
  books: Pick<BookRow, "id" | "title" | "hebrew_title" | "external_refs">[]
) {
  if (!info.index && !info.heIndexTitle) return undefined;
  const titleKey = info.heIndexTitle ? bookTitleKey(info.heIndexTitle) : null;
  return books.find((book) => {
    const sefariaId = ((book.external_refs ?? {}) as { sefaria?: { id?: string } }).sefaria?.id;
    if (info.index && sefariaId === info.index) return true;
    if (!titleKey) return false;
    return [book.title, book.hebrew_title].some((title) => title && bookTitleKey(title) === titleKey);
  });
}

async function writeGraphEdges(row: LessonRow, resolved: { candidate: CitationCandidate; info: ResolvedInfo | null }[]) {
  const edges: Database["public"]["Tables"]["kg_edges"]["Insert"][] = [];
  for (const { candidate, info } of resolved) {
    if (!info?.bookId) continue;
    edges.push({
      user_id: row.user_id,
      from_type: "lesson",
      from_id: row.id,
      relation: "quotes",
      to_type: "book",
      to_id: info.bookId,
      origin: "ai",
      weight: candidate.confidence,
      evidence: { atSeconds: candidate.atSeconds, ref: info.ref } as Json,
    });
  }
  if (row.book_id) {
    edges.push({ user_id: row.user_id, from_type: "lesson", from_id: row.id, relation: "about", to_type: "book", to_id: row.book_id, origin: "user", weight: 1 });
  }
  if (row.rabbi_id) {
    edges.push({ user_id: row.user_id, from_type: "lesson", from_id: row.id, relation: "about", to_type: "rabbi", to_id: row.rabbi_id, origin: "user", weight: 1 });
  }
  // Dedupe by endpoint pair — two citations of one book are one edge.
  const unique = new Map(edges.map((edge) => [`${edge.relation}:${edge.to_type}:${edge.to_id}`, edge]));
  await kgEdgesRepo.upsertMany([...unique.values()]).catch((err) => console.error("[lessons] edge write failed:", err));
}

// ---------------------------------------------------------------------------
// The sweep — scripts/cron.ts → lesson_pipeline
// ---------------------------------------------------------------------------

export async function runLessonPipelineSweep(budgetMs: number): Promise<{ lessons: number; steps: number }> {
  const deadline = Date.now() + budgetMs;
  const claimable = await lessonsRepo.listClaimable(20);
  let steps = 0;
  let lessons = 0;

  for (const lesson of claimable) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const result = await advanceLesson(lesson.id, { userId: null, budgetMs: remaining });
    if (result.steps > 0) lessons++;
    steps += result.steps;
  }
  return { lessons, steps };
}
