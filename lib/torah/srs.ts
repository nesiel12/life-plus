// Spaced repetition for the flashcards in "לתרגל" — SM-2.
//
// SM-2 (SuperMemo 2) rather than a hand-rolled curve or FSRS:
//   - A hand-rolled "tomorrow if wrong, next week if right" ladder is what
//     the brief asks for literally, and it is what SM-2 does on its first two
//     reps anyway — but it has no notion of a card that is *easy* for this
//     particular user, so every card converges on the same schedule no matter
//     how well it is known.
//   - FSRS is better, and needs a trained weight set and a review history to
//     fit it against. There is no history yet. SM-2 is the algorithm with no
//     cold-start problem, and srs_reviews is being logged from day one
//     precisely so a later move to FSRS has data to fit.
//
// Everything here is pure: state in, state out, with `now` injected. A
// scheduler that reads the clock internally can only be tested by waiting.

/**
 * Recall quality, the SM-2 scale.
 *
 * 0–2 are failures (the card was not recalled), 3–5 are successes of
 * increasing ease. The UI does not show a 0–5 scale — see GRADE_BY_ANSWER.
 */
export type SrsGrade = 0 | 1 | 2 | 3 | 4 | 5;

/** What the four Anki-style buttons map to. */
export type SrsAnswer = "again" | "hard" | "good" | "easy";

export const GRADE_BY_ANSWER: Record<SrsAnswer, SrsGrade> = {
  again: 0,
  hard: 3,
  good: 4,
  easy: 5,
};

export interface SrsState {
  /** SM-2's EF. Never below MIN_EASE_FACTOR. */
  easeFactor: number;
  /** Days until the next review. 0 on a card that has never been graded. */
  intervalDays: number;
  /** Consecutive successful reviews. Reset to 0 by any failure. */
  repetitions: number;
  /** How many times a card that had matured was then forgotten. */
  lapses: number;
  dueAt: Date;
}

/** The state a freshly created card starts in: due immediately. */
export function newCardState(now: Date = new Date()): SrsState {
  return {
    easeFactor: DEFAULT_EASE_FACTOR,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    dueAt: new Date(now.getTime()),
  };
}

const DEFAULT_EASE_FACTOR = 2.5;

// SM-2's own floor. Below this the interval stops growing meaningfully and
// the card would be shown forever at a fixed spacing.
const MIN_EASE_FACTOR = 1.3;

const FIRST_INTERVAL_DAYS = 1;
const SECOND_INTERVAL_DAYS = 6;

// A failed card comes back inside the same session, not tomorrow. Waiting a
// day to re-show something the user just got wrong wastes the one moment
// they are already thinking about it.
const RELEARN_MINUTES = 10;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;

// Anything beyond this is functionally "known". Uncapped, SM-2 will happily
// schedule a well-known card 40 years out, which is indistinguishable from
// deleting it.
const MAX_INTERVAL_DAYS = 365 * 2;

export function isFailure(grade: SrsGrade): boolean {
  return grade < 3;
}

/**
 * SM-2's ease adjustment.
 *
 * EF' = EF + (0.1 − (5−q) × (0.08 + (5−q) × 0.02))
 *
 * A grade of 4 leaves ease unchanged, 5 raises it, 3 and below lower it.
 */
function nextEaseFactor(easeFactor: number, grade: SrsGrade): number {
  const miss = 5 - grade;
  const adjusted = easeFactor + (0.1 - miss * (0.08 + miss * 0.02));
  return Math.max(MIN_EASE_FACTOR, roundTo(adjusted, 4));
}

function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * Applies one review to a card's state.
 *
 * Returns the new state; never mutates the input, so a caller can diff the
 * two to show "this card moved from 6 days to 15".
 */
export function review(state: SrsState, grade: SrsGrade, now: Date = new Date()): SrsState {
  const easeFactor = nextEaseFactor(state.easeFactor, grade);

  if (isFailure(grade)) {
    return {
      easeFactor,
      // The interval resets, but ease carries the memory of the failure
      // forward — that is the whole difference between SM-2 and a fixed
      // ladder. A card failed twice returns to the long intervals more
      // slowly than one failed once.
      intervalDays: 0,
      repetitions: 0,
      // Only a card that had actually matured counts as a lapse. Failing a
      // brand-new card is not forgetting, it is just not having learned it
      // yet, and counting it would make every new deck look like a disaster.
      lapses: state.repetitions > 0 ? state.lapses + 1 : state.lapses,
      dueAt: new Date(now.getTime() + RELEARN_MINUTES * MS_PER_MINUTE),
    };
  }

  const repetitions = state.repetitions + 1;
  const intervalDays = Math.min(
    MAX_INTERVAL_DAYS,
    repetitions === 1
      ? FIRST_INTERVAL_DAYS
      : repetitions === 2
        ? SECOND_INTERVAL_DAYS
        : Math.max(FIRST_INTERVAL_DAYS, Math.round(state.intervalDays * easeFactor))
  );

  return {
    easeFactor,
    intervalDays,
    repetitions,
    lapses: state.lapses,
    dueAt: new Date(now.getTime() + intervalDays * MS_PER_DAY),
  };
}

export function reviewAnswer(state: SrsState, answer: SrsAnswer, now: Date = new Date()): SrsState {
  return review(state, GRADE_BY_ANSWER[answer], now);
}

export interface DueCard {
  id: string;
  dueAt: Date;
  suspendedAt?: Date | null;
}

/**
 * The cards to study right now, soonest-due first.
 *
 * Overdue cards lead, which is both what the user expects and what keeps a
 * backlog from being hidden behind cards that only just came due.
 */
export function dueCards<T extends DueCard>(cards: T[], now: Date = new Date(), limit?: number): T[] {
  const due = cards
    .filter((card) => !card.suspendedAt && card.dueAt.getTime() <= now.getTime())
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());

  return limit === undefined ? due : due.slice(0, limit);
}

/**
 * How well a card is known, for the mastery ranking the brief asks for.
 *
 * Driven by interval rather than repetition count, because interval is the
 * thing that actually encodes retention: ten reviews that keep lapsing back
 * to a one-day interval is not mastery, and repetition count would call it
 * that.
 */
export type MasteryTier = "new" | "learning" | "young" | "mature" | "mastered";

export function masteryTier(state: Pick<SrsState, "repetitions" | "intervalDays">): MasteryTier {
  if (state.repetitions === 0) return "new";
  if (state.intervalDays < SECOND_INTERVAL_DAYS) return "learning";
  if (state.intervalDays < 21) return "young";
  if (state.intervalDays < 90) return "mature";
  return "mastered";
}

export const MASTERY_LABELS: Record<MasteryTier, string> = {
  new: "חדש",
  learning: "בלימוד",
  young: "מתגבש",
  mature: "מבוסס",
  mastered: "שלוט",
};

/**
 * Deck-level progress, 0..1, for the progress bar.
 *
 * Weighted by tier rather than counting mastered cards only, so early
 * progress through a large deck is visible — a bar that reads 0% for the
 * first three weeks tells the user nothing and is why they stop.
 */
export function deckProgress(states: Pick<SrsState, "repetitions" | "intervalDays">[]): number {
  if (states.length === 0) return 0;

  const WEIGHT: Record<MasteryTier, number> = {
    new: 0,
    learning: 0.25,
    young: 0.5,
    mature: 0.8,
    mastered: 1,
  };

  const total = states.reduce((sum, state) => sum + WEIGHT[masteryTier(state)], 0);
  return roundTo(total / states.length, 4);
}
