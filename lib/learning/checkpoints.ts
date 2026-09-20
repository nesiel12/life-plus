// Interactive video checkpoints — comprehension checks at key moments.
//
// Pure. The model proposes checkpoints from the video's captions; everything
// that decides whether a checkpoint is valid, where it sits, and when the
// player should stop for it lives here, where it is tested.

import { parseTimecode } from "@/lib/torah/lessons/timecode";

export interface Checkpoint {
  id: string;
  /** When the player pauses for it. */
  atSeconds: number;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface CheckpointAnswer {
  choice: number;
  correct: boolean;
  answeredAt: string;
}

export interface RawCheckpoint {
  atSeconds?: number;
  question?: string;
  options?: string[];
  correctIndex?: number;
  explanation?: string;
}

/**
 * A checkpoint time as the model wrote it → seconds.
 *
 * The model is asked for a "MM:SS" STRING copied from the transcript. Asked for
 * a number of seconds it returned the timecode's digits run together — 4:03 as
 * 403, 18:21 as 1821 — which is a plausible-looking wrong answer no validation
 * can catch, so a bare number is refused outright: a time without a colon is
 * ambiguous, and a checkpoint at the wrong moment is worse than none.
 */
export function parseCheckpointTime(value: string | null | undefined): number | null {
  const text = (value ?? "").trim();
  if (!text.includes(":")) return null;
  return parseTimecode(text);
}

/** Pausing in the first seconds interrupts before anything was taught. */
export const MIN_START_SECONDS = 30;
/** Two stops in quick succession feel like a quiz, not a lesson. */
export const MIN_SPACING_SECONDS = 60;
export const MAX_CHECKPOINTS = 6;

export interface CheckpointWindow {
  fromSeconds: number;
  toSeconds: number;
}

/**
 * The stretches of the video a checkpoint should fall in — one per window.
 *
 * Left to itself the model piles its questions into the opening minutes (seen
 * on an 18-minute video: five checkpoints, all before 2:40), so the spread is
 * decided here and handed over as instructions. Longer videos get more stops,
 * but never so many that they crowd each other (MIN_SPACING_SECONDS).
 */
export function checkpointWindows(durationSeconds: number): CheckpointWindow[] {
  const duration = Math.max(0, Math.floor(durationSeconds));
  if (duration < MIN_START_SECONDS + MIN_SPACING_SECONDS) return [];
  const byLength = duration < 6 * 60 ? 3 : duration < 15 * 60 ? 4 : 5;
  const count = Math.max(1, Math.min(byLength, MAX_CHECKPOINTS, Math.floor((duration - MIN_START_SECONDS) / MIN_SPACING_SECONDS)));
  const usable = duration - MIN_START_SECONDS - 5;
  return Array.from({ length: count }, (_, i) => ({
    fromSeconds: Math.round(MIN_START_SECONDS + (usable * i) / count),
    toSeconds: Math.round(MIN_START_SECONDS + (usable * (i + 1)) / count),
  }));
}

/**
 * Keeps only well-formed checkpoints, in time order, spaced out, inside the
 * video. Ids are derived from the time so they are stable across reloads.
 */
export function normalizeCheckpoints(raw: readonly RawCheckpoint[], durationSeconds?: number | null): Checkpoint[] {
  const end = durationSeconds && durationSeconds > 0 ? durationSeconds - 5 : Infinity;
  const valid = raw
    .map((c) => {
      const options = (c.options ?? []).map((o) => (o ?? "").trim()).filter(Boolean).slice(0, 4);
      const question = (c.question ?? "").trim();
      const at = Math.round(Number(c.atSeconds));
      const correctIndex = Number(c.correctIndex);
      if (!question || options.length < 2 || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
        return null;
      }
      if (!Number.isFinite(at) || at < MIN_START_SECONDS || at > end) return null;
      if (new Set(options).size !== options.length) return null;
      return { atSeconds: at, question, options, correctIndex, explanation: (c.explanation ?? "").trim() };
    })
    .filter((c): c is Omit<Checkpoint, "id"> => c !== null)
    .sort((a, b) => a.atSeconds - b.atSeconds);

  const spaced: Checkpoint[] = [];
  for (const c of valid) {
    const last = spaced[spaced.length - 1];
    if (last && c.atSeconds - last.atSeconds < MIN_SPACING_SECONDS) continue;
    spaced.push({ ...c, id: `cp-${c.atSeconds}` });
    if (spaced.length === MAX_CHECKPOINTS) break;
  }
  return spaced;
}

/** A forward step larger than this is a seek, not playback. */
const MAX_PLAYBACK_STEP = 2.5;

/**
 * The checkpoint the player just played into, if any.
 *
 * Only continuous forward PLAYBACK triggers a stop: a learner who seeks past
 * three checkpoints to rewatch the ending did not ask to be quizzed three
 * times. Answered or dismissed checkpoints never stop the video again.
 */
export function dueCheckpoint<T extends Pick<Checkpoint, "id" | "atSeconds">>(
  checkpoints: readonly T[],
  previousTime: number,
  currentTime: number,
  handled: ReadonlySet<string>
): T | null {
  const step = currentTime - previousTime;
  if (step <= 0 || step > MAX_PLAYBACK_STEP) return null;
  return checkpoints.find((c) => !handled.has(c.id) && c.atSeconds > previousTime && c.atSeconds <= currentTime) ?? null;
}

export function checkpointScore(
  checkpoints: readonly Pick<Checkpoint, "id">[],
  answers: Readonly<Record<string, CheckpointAnswer>>
): { answered: number; correct: number; total: number } {
  let answered = 0;
  let correct = 0;
  for (const c of checkpoints) {
    const a = answers[c.id];
    if (!a) continue;
    answered++;
    if (a.correct) correct++;
  }
  return { answered, correct, total: checkpoints.length };
}

/** Reads the stored answers map defensively. */
export function readAnswers(value: unknown): Record<string, CheckpointAnswer> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, CheckpointAnswer> = {};
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    const a = raw as Partial<CheckpointAnswer>;
    if (typeof a?.choice === "number" && typeof a.correct === "boolean") {
      out[id] = { choice: a.choice, correct: a.correct, answeredAt: typeof a.answeredAt === "string" ? a.answeredAt : "" };
    }
  }
  return out;
}
