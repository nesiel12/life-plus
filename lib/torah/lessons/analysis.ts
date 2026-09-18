// Post-processing for a lesson's analysis — chapters, citation candidates and
// learning chunks — turning what a model proposed into what gets stored.
//
// Pure. The model proposes; this module disposes: timestamps are parsed and
// bounded, chapters are ordered and de-duplicated, and every citation is run
// through the deterministic detector in citations.ts, which also sweeps the
// transcript on its own so a verse the model skipped still reaches the
// Sources Panel.

import { detectCitations, isPlausibleSefariaRef, type CitationKind } from "@/lib/torah/citations";
import { bookTitleKey } from "@/lib/torah/hebrew";
import { parseTimecode } from "@/lib/torah/lessons/timecode";
import { textBetween, type TranscriptLine } from "@/lib/torah/lessons/transcript";

// ---------------------------------------------------------------------------
// Chapters ("smart timestamps")
// ---------------------------------------------------------------------------

export interface RawSegment {
  start?: string | number | null;
  title?: string | null;
  summary?: string | null;
}

export interface LessonChapter {
  startSeconds: number;
  /** Null for the final chapter, which runs to the end. */
  endSeconds: number | null;
  title: string;
  summary: string | null;
  sortOrder: number;
}

// Two chapters closer than this are one topic the model split twice.
const MIN_CHAPTER_SECONDS = 20;

/**
 * Model chapters → ordered, bounded, gap-free chapters starting at 0:00.
 *
 * The first chapter is pulled to 0:00 so the whole media is covered, a
 * chapter past the end is dropped, and chapters too close together are merged
 * into the first.
 */
export function normalizeChapters(raw: RawSegment[], durationSeconds: number | null): LessonChapter[] {
  const parsed = raw
    .map((segment) => ({
      start: parseTimecode(segment.start ?? null),
      title: segment.title?.trim() ?? "",
      summary: segment.summary?.trim() || null,
    }))
    .filter((s): s is { start: number; title: string; summary: string | null } => s.start !== null && s.title.length > 0)
    .filter((s) => !durationSeconds || s.start < durationSeconds)
    .sort((a, b) => a.start - b.start);

  const merged: typeof parsed = [];
  for (const segment of parsed) {
    const previous = merged[merged.length - 1];
    if (previous && segment.start - previous.start < MIN_CHAPTER_SECONDS) continue;
    merged.push(segment);
  }
  if (merged.length > 0) merged[0] = { ...merged[0], start: 0 };

  return merged.map((segment, index) => ({
    startSeconds: segment.start,
    endSeconds: index + 1 < merged.length ? merged[index + 1].start : null,
    title: segment.title,
    summary: segment.summary,
    sortOrder: index,
  }));
}

// ---------------------------------------------------------------------------
// Citations
// ---------------------------------------------------------------------------

export interface ModelCitation {
  /** As the speaker said it. */
  quote?: string | null;
  /** Normalised by the model, in Hebrew — "בבא מציעא נט ב". */
  reference?: string | null;
  at?: string | number | null;
  kind?: string | null;
  confidence?: number | null;
}

export interface CitationCandidate {
  /** What was said — stored as lesson_sources.raw_citation. */
  raw: string;
  /** The best Hebrew reference to resolve. */
  reference: string;
  atSeconds: number | null;
  kind: CitationKind;
  confidence: number;
  /** Present when the deterministic parser could build one. */
  sefariaRef?: string;
  /** How many times it was cited in the lesson. */
  mentions: number;
}

const KINDS: CitationKind[] = ["verse", "talmud", "halacha", "book", "other"];
const MAX_CANDIDATES = 30;
// Two mentions of the same source within this window are one citation.
const SAME_MENTION_SECONDS = 90;

function kindOf(value: string | null | undefined): CitationKind {
  return KINDS.includes(value as CitationKind) ? (value as CitationKind) : "other";
}

function clampConfidence(value: number | null | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

/**
 * Every citation worth resolving, from both directions:
 *   1. the deterministic sweep — detectCitations over each transcript line,
 *      timed by that line; confidence 0.95 (the pattern matched, the speaker
 *      may still have been paraphrasing);
 *   2. the model's list — its reference re-parsed by the same detector when
 *      possible, kept as a Hebrew reference for Sefaria's parser otherwise.
 *
 * Collapsed by source: the same daf quoted twice in a minute is one card; the
 * first mention's time wins and the count is kept.
 */
export function collectCitationCandidates(lines: TranscriptLine[], modelCitations: ModelCitation[]): CitationCandidate[] {
  const candidates: CitationCandidate[] = [];

  for (const line of lines) {
    for (const detected of detectCitations(line.text)) {
      candidates.push({
        raw: detected.raw,
        reference: detected.raw,
        atSeconds: line.start,
        kind: detected.kind,
        confidence: 0.95,
        sefariaRef: detected.sefariaRef && isPlausibleSefariaRef(detected.sefariaRef) ? detected.sefariaRef : undefined,
        mentions: 1,
      });
    }
  }

  for (const citation of modelCitations) {
    const reference = citation.reference?.trim() || citation.quote?.trim();
    // A reference needs at least a work and a place in it; "רמב" is a
    // fragment of one, and resolving it can only match something unrelated.
    if (!reference || reference.replace(/[^\u05D0-\u05EAA-Za-z0-9]/g, "").length < 5) continue;
    const [detected] = detectCitations(reference);
    candidates.push({
      raw: citation.quote?.trim() || reference,
      reference,
      atSeconds: parseTimecode(citation.at ?? null),
      kind: detected?.kind ?? kindOf(citation.kind),
      confidence: clampConfidence(citation.confidence, 0.7),
      sefariaRef: detected?.sefariaRef && isPlausibleSefariaRef(detected.sefariaRef) ? detected.sefariaRef : undefined,
      mentions: 1,
    });
  }

  const kept: CitationCandidate[] = [];
  for (const candidate of candidates.sort((a, b) => (a.atSeconds ?? Infinity) - (b.atSeconds ?? Infinity))) {
    const key = identity(candidate);
    const duplicate = kept.find(
      (existing) =>
        identity(existing) === key &&
        (existing.atSeconds === null ||
          candidate.atSeconds === null ||
          Math.abs(existing.atSeconds - candidate.atSeconds) <= SAME_MENTION_SECONDS ||
          existing.sefariaRef !== undefined)
    );
    if (duplicate) {
      duplicate.mentions += 1;
      duplicate.confidence = Math.max(duplicate.confidence, candidate.confidence);
      duplicate.sefariaRef = duplicate.sefariaRef ?? candidate.sefariaRef;
      continue;
    }
    kept.push({ ...candidate });
  }

  return kept.slice(0, MAX_CANDIDATES);
}

// Words a speaker (or a model) wraps around a reference that Sefaria's parser
// does not want: "מסכת בבא מציעא דף נט עמוד ב" fails, "בבא מציעא נט ב" resolves.
const REFERENCE_FILLER = /(?:^|\s)(?:מסכת|דף|עמוד|פרק|פסוק|הלכה|סימן|סעיף|קטן|ספר)(?=\s|$)/g;
const RAMBAM_ALIASES = /(?:משנה\s+תורה\s*,?\s*)?(?:ל?ה?רמב["״׳']?ם)/g;

/**
 * Spellings of one reference worth trying against Sefaria's name API, most
 * literal first. Verified against the live API: the model's "משנה תורה
 * להרמב״ם הלכות יסודי התורה פרק ט׳ הלכה א׳" does not resolve, while
 * "הלכות יסודי התורה ט א" does.
 */
export function referenceVariants(reference: string): string[] {
  const original = reference.trim();
  if (!original) return [];
  const withoutGeresh = (value: string) => value.replace(/(?<=[\u05D0-\u05EA])["״׳'](?=[\u05D0-\u05EA]?(?:\s|$|,))/g, "");
  const tidy = (value: string) => value.replace(/[,:;()]/g, " ").replace(/\s+/g, " ").trim();

  const stripped = tidy(original.replace(REFERENCE_FILLER, " "));
  const plain = withoutGeresh(stripped);
  const rambam = new RegExp(RAMBAM_ALIASES.source).test(plain) ? tidy(plain.replace(RAMBAM_ALIASES, " ")) : null;

  return [...new Set([original, plain, rambam, stripped].filter((v): v is string => Boolean(v)))].slice(0, 4);
}

function identity(candidate: CitationCandidate): string {
  return candidate.sefariaRef?.toLowerCase() ?? bookTitleKey(candidate.reference);
}

// ---------------------------------------------------------------------------
// Learning chunks
// ---------------------------------------------------------------------------

export interface LearningChunkDraft {
  ordinal: number;
  title: string;
  body: string;
  startSeconds: number;
  endSeconds: number | null;
}

export interface ChunkOptions {
  /** The length of study between practice pauses. */
  targetSeconds?: number;
  maxChunks?: number;
}

/**
 * Divides a lesson into study parts, each followed by a practice pause.
 *
 * Boundaries fall on chapter boundaries — a pause in the middle of a topic is
 * the wrong moment to be asked about it — at roughly equal study time. With no
 * chapters the transcript is split on time alone.
 */
export function buildLearningChunks(
  lines: TranscriptLine[],
  chapters: LessonChapter[],
  durationSeconds: number | null,
  options: ChunkOptions = {}
): LearningChunkDraft[] {
  if (lines.length === 0) return [];
  const duration = durationSeconds ?? lines[lines.length - 1].end;
  const target = options.targetSeconds ?? 8 * 60;
  const count = Math.min(options.maxChunks ?? 6, Math.max(1, Math.round(duration / target)));

  const boundaries: { start: number; titles: string[] }[] = [];
  if (chapters.length > 0) {
    const ideal = duration / count;
    let groupIndex = 0;
    for (const chapter of chapters) {
      const wanted = Math.min(count - 1, Math.floor(chapter.startSeconds / ideal));
      if (boundaries.length === 0 || (wanted > groupIndex && boundaries.length < count)) {
        groupIndex = wanted;
        boundaries.push({ start: chapter.startSeconds, titles: [chapter.title] });
      } else {
        boundaries[boundaries.length - 1].titles.push(chapter.title);
      }
    }
  } else {
    for (let i = 0; i < count; i++) boundaries.push({ start: Math.round((duration / count) * i), titles: [] });
  }

  const drafts: LearningChunkDraft[] = [];
  boundaries.forEach((boundary, index) => {
    const end = index + 1 < boundaries.length ? boundaries[index + 1].start : null;
    const body = textBetween(lines, boundary.start, end);
    if (!body) return;
    const title =
      boundary.titles.length === 0
        ? `חלק ${drafts.length + 1}`
        : boundary.titles.length <= 2
          ? boundary.titles.join(" · ")
          : `${boundary.titles.slice(0, 2).join(" · ")} ועוד`;
    drafts.push({ ordinal: drafts.length, title, body, startSeconds: boundary.start, endSeconds: end });
  });

  // Chunks that were dropped for being empty leave ordinals contiguous and
  // the previous chunk's end reaching the next surviving start.
  return drafts.map((draft, i) => ({ ...draft, endSeconds: i + 1 < drafts.length ? drafts[i + 1].startSeconds : null }));
}
