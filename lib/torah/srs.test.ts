import { describe, expect, it } from "vitest";
import {
  deckProgress,
  dueCards,
  isFailure,
  masteryTier,
  newCardState,
  review,
  reviewAnswer,
  type SrsGrade,
  type SrsState,
} from "@/lib/torah/srs";

const NOW = new Date("2026-09-16T08:00:00.000Z");
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/** Drives a card through a run of grades, returning the final state. */
function sequence(grades: SrsGrade[], start: SrsState = newCardState(NOW)): SrsState {
  return grades.reduce((state, grade) => review(state, grade, NOW), start);
}

describe("newCardState", () => {
  it("is due immediately", () => {
    expect(newCardState(NOW).dueAt.getTime()).toBe(NOW.getTime());
  });

  it("starts with no repetitions and the default ease", () => {
    const state = newCardState(NOW);
    expect(state.repetitions).toBe(0);
    expect(state.intervalDays).toBe(0);
    expect(state.easeFactor).toBe(2.5);
  });
});

describe("isFailure", () => {
  it("treats 0-2 as failures and 3-5 as passes", () => {
    expect([0, 1, 2].every((g) => isFailure(g as SrsGrade))).toBe(true);
    expect([3, 4, 5].some((g) => isFailure(g as SrsGrade))).toBe(false);
  });
});

describe("review — the SM-2 ladder", () => {
  it("schedules the first success one day out", () => {
    const state = review(newCardState(NOW), 4, NOW);
    expect(state.intervalDays).toBe(1);
    expect(daysBetween(NOW, state.dueAt)).toBe(1);
  });

  it("schedules the second success six days out", () => {
    const state = sequence([4, 4]);
    expect(state.intervalDays).toBe(6);
  });

  it("multiplies by ease from the third success on", () => {
    // After two passes at grade 4 ease is unchanged at 2.5, so 6 × 2.5 = 15.
    const state = sequence([4, 4, 4]);
    expect(state.easeFactor).toBe(2.5);
    expect(state.intervalDays).toBe(15);
  });

  it("never mutates the state it was given", () => {
    const before = newCardState(NOW);
    const snapshot = { ...before };
    review(before, 5, NOW);
    expect(before).toEqual(snapshot);
  });
});

describe("review — ease adjustment", () => {
  it("leaves ease unchanged on a grade of 4", () => {
    expect(review(newCardState(NOW), 4, NOW).easeFactor).toBe(2.5);
  });

  it("raises ease on a grade of 5", () => {
    expect(review(newCardState(NOW), 5, NOW).easeFactor).toBeGreaterThan(2.5);
  });

  it("lowers ease on a grade of 3", () => {
    expect(review(newCardState(NOW), 3, NOW).easeFactor).toBeLessThan(2.5);
  });

  it("never falls below the 1.3 floor", () => {
    // Twelve straight failures would drive EF far negative if unclamped.
    const state = sequence(Array<SrsGrade>(12).fill(0));
    expect(state.easeFactor).toBe(1.3);
  });
});

describe("review — failure handling", () => {
  it("resets the interval and repetitions", () => {
    const mature = sequence([4, 4, 4]);
    const failed = review(mature, 1, NOW);
    expect(failed.repetitions).toBe(0);
    expect(failed.intervalDays).toBe(0);
  });

  it("brings a failed card back within the session, not tomorrow", () => {
    const failed = review(sequence([4, 4]), 0, NOW);
    const minutesOut = (failed.dueAt.getTime() - NOW.getTime()) / 60000;
    expect(minutesOut).toBe(10);
  });

  it("counts a lapse only for a card that had matured", () => {
    const lapsed = review(sequence([4, 4]), 0, NOW);
    expect(lapsed.lapses).toBe(1);
  });

  it("does not count failing a brand-new card as a lapse", () => {
    expect(review(newCardState(NOW), 0, NOW).lapses).toBe(0);
  });

  it("carries the ease penalty forward past the reset", () => {
    // The point of SM-2 over a fixed ladder: a card failed once returns to
    // long intervals more slowly than one that never was.
    const clean = sequence([4, 4, 4]);
    const recovered = sequence([4, 4, 4], review(sequence([4, 4]), 0, NOW));
    expect(recovered.intervalDays).toBeLessThan(clean.intervalDays);
  });
});

describe("review — interval ceiling", () => {
  it("caps a long-known card at two years", () => {
    const state = sequence(Array<SrsGrade>(40).fill(5));
    expect(state.intervalDays).toBe(730);
  });
});

describe("reviewAnswer", () => {
  it("maps the four UI buttons onto grades", () => {
    expect(reviewAnswer(newCardState(NOW), "again", NOW).repetitions).toBe(0);
    expect(reviewAnswer(newCardState(NOW), "good", NOW).repetitions).toBe(1);
    expect(reviewAnswer(newCardState(NOW), "easy", NOW).easeFactor).toBeGreaterThan(
      reviewAnswer(newCardState(NOW), "good", NOW).easeFactor
    );
    expect(reviewAnswer(newCardState(NOW), "hard", NOW).easeFactor).toBeLessThan(2.5);
  });
});

describe("dueCards", () => {
  const card = (id: string, offsetDays: number, suspended = false) => ({
    id,
    dueAt: new Date(NOW.getTime() + offsetDays * MS_PER_DAY),
    suspendedAt: suspended ? NOW : null,
  });

  it("returns only cards due now or overdue", () => {
    const cards = [card("future", 3), card("due", 0), card("overdue", -5)];
    expect(dueCards(cards, NOW).map((c) => c.id)).toEqual(["overdue", "due"]);
  });

  it("puts the most overdue first", () => {
    const cards = [card("a", -1), card("b", -9)];
    expect(dueCards(cards, NOW)[0].id).toBe("b");
  });

  it("skips suspended cards even when due", () => {
    expect(dueCards([card("s", -2, true)], NOW)).toEqual([]);
  });

  it("respects a limit", () => {
    const cards = [card("a", -3), card("b", -2), card("c", -1)];
    expect(dueCards(cards, NOW, 2).map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("returns nothing from an empty deck", () => {
    expect(dueCards([], NOW)).toEqual([]);
  });
});

describe("masteryTier", () => {
  it("labels an ungraded card as new", () => {
    expect(masteryTier({ repetitions: 0, intervalDays: 0 })).toBe("new");
  });

  it("moves through the tiers as the interval grows", () => {
    expect(masteryTier({ repetitions: 1, intervalDays: 1 })).toBe("learning");
    expect(masteryTier({ repetitions: 2, intervalDays: 6 })).toBe("young");
    expect(masteryTier({ repetitions: 4, intervalDays: 30 })).toBe("mature");
    expect(masteryTier({ repetitions: 6, intervalDays: 200 })).toBe("mastered");
  });

  it("does not call a frequently-lapsing card mastered", () => {
    // Ten reviews but still on a one-day interval: repetition count would
    // say "expert", interval says otherwise.
    expect(masteryTier({ repetitions: 10, intervalDays: 1 })).toBe("learning");
  });
});

describe("deckProgress", () => {
  it("is 0 for an empty deck", () => {
    expect(deckProgress([])).toBe(0);
  });

  it("is 0 for an all-new deck", () => {
    expect(deckProgress([{ repetitions: 0, intervalDays: 0 }])).toBe(0);
  });

  it("is 1 for a fully mastered deck", () => {
    expect(deckProgress([{ repetitions: 9, intervalDays: 300 }])).toBe(1);
  });

  it("shows partial credit before anything is mastered", () => {
    const progress = deckProgress([
      { repetitions: 1, intervalDays: 1 },
      { repetitions: 2, intervalDays: 6 },
    ]);
    expect(progress).toBeGreaterThan(0);
    expect(progress).toBeLessThan(1);
  });
});
