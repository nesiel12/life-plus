// Timed transcripts — planning transcription windows, cleaning what a model
// returns for one window, stitching windows together, and normalising YouTube
// captions into the same shape.
//
// Pure, because every bug here is a timing bug, and timing bugs are only cheap
// to find against hand-written arrays (transcript.test.ts). A line that lands
// at the wrong second highlights the wrong sentence and seeks to the wrong
// place — quietly, for the whole lesson.

import { normalizeHebrewPunctuation, stripForeignScript } from "@/lib/torah/hebrew";
import { parseTimecode, promptTimecode } from "@/lib/torah/lessons/timecode";

export interface TranscriptLine {
  /** Seconds from the start of the media. */
  start: number;
  /** Seconds; equals the next line's start, or the window/media end. */
  end: number;
  text: string;
}

/** A line as a model returns it. */
export interface RawTranscriptLine {
  start?: string | number | null;
  text?: string | null;
}

export interface TimeWindow {
  start: number;
  end: number;
}

/**
 * Splits media into transcription windows.
 *
 * Fixed-size windows rather than one call over the whole file: a single call
 * over a 90-minute shiur both exceeds a serverless request budget and exceeds
 * what a model will write out in one response. A window is small enough to
 * finish inside one worker step and to be retried on its own.
 *
 * A trailing sliver shorter than a quarter window is folded into the previous
 * window rather than getting a call of its own for ten seconds of audio.
 */
export function planWindows(durationSeconds: number, windowSeconds: number): TimeWindow[] {
  const duration = Math.max(0, Math.floor(durationSeconds));
  const size = Math.max(30, Math.floor(windowSeconds));
  if (duration === 0) return [];

  const windows: TimeWindow[] = [];
  for (let start = 0; start < duration; start += size) {
    windows.push({ start, end: Math.min(duration, start + size) });
  }

  const last = windows[windows.length - 1];
  if (windows.length > 1 && last.end - last.start < size / 4) {
    windows.pop();
    windows[windows.length - 1].end = duration;
  }
  return windows;
}

/** The instruction for one window, with its absolute range spelled out. */
export function windowRangeLabel(window: TimeWindow): { from: string; to: string } {
  return { from: promptTimecode(window.start), to: promptTimecode(window.end) };
}

// Tolerance for a model reporting a timestamp a little outside the window it
// was asked about — ordinary at the boundaries, not a sign of a wrong answer.
const BOUNDARY_SLACK_SECONDS = 8;

/**
 * Cleans one window's lines into absolute, ordered, bounded lines.
 *
 * Handles what models actually do:
 *   - timestamps RELATIVE to the window ("00:05" for a line at 10:05) — when
 *     every time is below the window start and fits within the window length,
 *     the whole set is shifted;
 *   - missing or unparseable times — interpolated from the neighbours;
 *   - times slightly outside the window — clamped; far outside — dropped;
 *   - drift into another script mid-sentence — stripped (see hebrew.ts).
 */
export function normalizeWindowLines(raw: RawTranscriptLine[], window: TimeWindow): TranscriptLine[] {
  const length = window.end - window.start;
  const cleaned = raw
    .map((line) => ({
      time: parseTimecode(line.start ?? null),
      text: normalizeHebrewPunctuation(stripForeignScript((line.text ?? "").replace(/\s+/g, " ").trim())),
    }))
    .filter((line) => line.text.length > 0);

  if (cleaned.length === 0) return [];

  const known = cleaned.map((l) => l.time).filter((t): t is number => t !== null);
  const looksRelative =
    window.start > 0 &&
    known.length > 0 &&
    known.every((t) => t < window.start) &&
    Math.max(...known) <= length + BOUNDARY_SLACK_SECONDS;
  const offset = looksRelative ? window.start : 0;

  const timed: { time: number | null; text: string }[] = cleaned.map((line) => {
    if (line.time === null) return { time: null, text: line.text };
    const absolute = line.time + offset;
    if (absolute < window.start - BOUNDARY_SLACK_SECONDS || absolute > window.end + BOUNDARY_SLACK_SECONDS) {
      return { time: null, text: line.text };
    }
    return { time: Math.min(Math.max(absolute, window.start), Math.max(window.start, window.end - 1)), text: line.text };
  });

  // Interpolate the gaps: evenly between the surrounding known times.
  for (let i = 0; i < timed.length; i++) {
    if (timed[i].time !== null) continue;
    let j = i;
    while (j < timed.length && timed[j].time === null) j++;
    const before = i > 0 ? (timed[i - 1].time as number) : window.start;
    const after = j < timed.length ? (timed[j].time as number) : window.end;
    const span = j - i + 1;
    for (let k = i; k < j; k++) {
      timed[k].time = Math.round(before + ((after - before) * (k - i + 1)) / span);
    }
    i = j;
  }

  // Non-decreasing: a model occasionally lists a line out of order by a
  // second; re-sorting could reorder sentences, so later lines are lifted to
  // their predecessor's time instead.
  const ordered: { time: number; text: string }[] = [];
  for (const line of timed) {
    const previous = ordered[ordered.length - 1]?.time ?? window.start;
    ordered.push({ time: Math.max(previous, line.time as number), text: line.text });
  }

  return ordered.map((line, index) => ({
    start: line.time,
    end: Math.max(line.time, index + 1 < ordered.length ? ordered[index + 1].time : window.end),
    text: line.text,
  }));
}

/**
 * Appends a window's lines to the transcript so far.
 *
 * Windows are processed one at a time, possibly by different workers, and a
 * retried window may be appended after a partial success. Lines that start
 * before the transcript's current end are treated as a re-transcription of
 * audio already covered and dropped, so a retry never duplicates sentences.
 */
export function appendWindowLines(existing: TranscriptLine[], incoming: TranscriptLine[]): TranscriptLine[] {
  if (incoming.length === 0) return existing;
  if (existing.length === 0) return incoming;

  const last = existing[existing.length - 1];
  const fresh = incoming.filter((line) => line.start >= last.start && line.text !== last.text);
  if (fresh.length === 0) return existing;

  const stitched = [...existing];
  stitched[stitched.length - 1] = { ...last, end: Math.max(last.start, fresh[0].start) };
  return [...stitched, ...fresh];
}

/** A caption segment as the youtube-transcript package returns it. */
export interface CaptionSegment {
  text: string;
  offset: number;
  duration: number;
}

// Captions arrive a few words at a time. Merged into lines of about this
// length, or at the end of a sentence, whichever comes first.
const CAPTION_LINE_SECONDS = 12;

/**
 * YouTube captions → transcript lines.
 *
 * The package returns offsets in MILLISECONDS for the srv3 caption format and
 * in SECONDS for the classic one, with nothing in the result saying which.
 * Integers with durations in the hundreds are milliseconds; when the video
 * duration is known, offsets beyond it settle the question outright.
 */
export function normalizeCaptions(segments: CaptionSegment[], durationSeconds?: number | null): TranscriptLine[] {
  const usable = segments.filter((s) => s.text?.trim() && Number.isFinite(s.offset));
  if (usable.length === 0) return [];

  const maxOffset = Math.max(...usable.map((s) => s.offset));
  const allIntegers = usable.every((s) => Number.isInteger(s.offset) && Number.isInteger(s.duration));
  const medianDuration = [...usable.map((s) => s.duration)].sort((a, b) => a - b)[Math.floor(usable.length / 2)] ?? 0;
  const inMilliseconds =
    durationSeconds && durationSeconds > 0
      ? maxOffset > durationSeconds * 1.5
      : (allIntegers && medianDuration >= 100) ||
        // No duration to settle it: a caption stamped beyond four hours, if
        // read as seconds, would belong to a video longer than almost any that
        // exist — it is milliseconds. (An 18-minute video's last caption is
        // ~1,100,000 ms, well past this.)
        maxOffset > 4 * 3600;
  const scale = inMilliseconds ? 1 / 1000 : 1;

  const lines: TranscriptLine[] = [];
  let current: { start: number; end: number; parts: string[] } | null = null;

  for (const segment of usable) {
    const start = segment.offset * scale;
    const end = start + Math.max(0, segment.duration * scale);
    const text = decodeCaption(segment.text);
    if (!text) continue;

    if (!current) {
      current = { start, end, parts: [text] };
    } else {
      current.parts.push(text);
      current.end = Math.max(current.end, end);
    }

    const sentenceEnds = /[.!?׃:]$/.test(text);
    if (current.end - current.start >= CAPTION_LINE_SECONDS || sentenceEnds) {
      lines.push({ start: Math.floor(current.start), end: Math.ceil(current.end), text: current.parts.join(" ") });
      current = null;
    }
  }
  if (current) {
    lines.push({ start: Math.floor(current.start), end: Math.ceil(current.end), text: current.parts.join(" ") });
  }

  // Ends meet the next start, so the active-line highlight never has a gap.
  return lines.map((line, i) => ({ ...line, end: i + 1 < lines.length ? Math.max(line.start, lines[i + 1].start) : line.end }));
}

function decodeCaption(text: string): string {
  return normalizeHebrewPunctuation(
    text
      .replace(/&amp;#39;|&#39;/g, "'")
      .replace(/&amp;quot;|&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/\[[^\]]*\]/g, "") // [מוזיקה], [צחוק]
      .replace(/\s+/g, " ")
      .trim()
  );
}

export function linesToText(lines: TranscriptLine[]): string {
  return lines.map((line) => line.text).join("\n");
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Index of the line playing at `seconds`, or -1 before the first line. Binary search. */
export function activeLineIndex(lines: TranscriptLine[], seconds: number): number {
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lines[mid].start <= seconds) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

/**
 * The transcript as the analysis model reads it: "[MM:SS] text" per line.
 *
 * Bounded. Past the cap, consecutive lines are merged into longer ones (keeping
 * the earlier timestamp) until it fits, so every part of the shiur is still
 * represented — truncating would leave the model blind to the second half.
 */
export function transcriptForPrompt(lines: TranscriptLine[], maxChars = 120_000): string {
  let working = lines;
  let rendered = render(working);
  while (rendered.length > maxChars && working.length > 1) {
    const merged: TranscriptLine[] = [];
    for (let i = 0; i < working.length; i += 2) {
      const a = working[i];
      const b = working[i + 1];
      merged.push(b ? { start: a.start, end: b.end, text: `${a.text} ${b.text}` } : a);
    }
    working = merged;
    rendered = render(working);
  }
  return rendered.length > maxChars ? rendered.slice(0, maxChars) : rendered;
}

function render(lines: TranscriptLine[]): string {
  // Normalised here too, for transcripts stored before the punctuation rule.
  return lines.map((line) => `[${promptTimecode(line.start)}] ${normalizeHebrewPunctuation(line.text)}`).join("\n");
}

/** The transcript text between two times, for a learning chunk's body. */
export function textBetween(lines: TranscriptLine[], start: number, end: number | null): string {
  return lines
    .filter((line) => line.start >= start && (end === null || line.start < end))
    .map((line) => line.text)
    .join(" ")
    .trim();
}

/** Parses the jsonb `lines` column defensively. */
export function parseStoredLines(value: unknown): TranscriptLine[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (line): line is TranscriptLine =>
      line !== null &&
      typeof line === "object" &&
      typeof (line as TranscriptLine).start === "number" &&
      typeof (line as TranscriptLine).end === "number" &&
      typeof (line as TranscriptLine).text === "string"
  );
}
