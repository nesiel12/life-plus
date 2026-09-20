import { describe, expect, it } from "vitest";
import {
  MAX_BONUS_PER_ROUND,
  MAX_SESSION_BONUS,
  applyRound,
  initialCombo,
  multiplierFor,
  outcomeForAnswer,
  outcomeForScore,
  progressToNextTier,
  type ComboState,
} from "@/lib/torah/combo";

function run(outcomes: ("clean" | "shaky" | "miss")[], base = 10): ComboState {
  return outcomes.reduce((state, outcome) => applyRound(state, outcome, base).state, initialCombo());
}

describe("multipliers", () => {
  it("climb in tiers at 3, 5 and 8", () => {
    expect([0, 2, 3, 4, 5, 7, 8, 20].map(multiplierFor)).toEqual([1, 1, 1.5, 1.5, 2, 2, 3, 3]);
  });

  it("report progress toward the next tier", () => {
    expect(progressToNextTier(0)).toBe(0);
    expect(progressToNextTier(4)).toBe(0.5);
    expect(progressToNextTier(12)).toBe(1);
  });
});

describe("outcomes", () => {
  it("map SRS answers: again misses, hard is shaky, good/easy are clean", () => {
    expect(outcomeForAnswer("again")).toBe("miss");
    expect(outcomeForAnswer("hard")).toBe("shaky");
    expect(outcomeForAnswer("good")).toBe("clean");
    expect(outcomeForAnswer("easy")).toBe("clean");
  });

  it("map written scores at 70 and 40, and treat an ungraded answer as shaky", () => {
    expect(outcomeForScore(70)).toBe("clean");
    expect(outcomeForScore(55)).toBe("shaky");
    expect(outcomeForScore(20)).toBe("miss");
    expect(outcomeForScore(null)).toBe("shaky");
  });
});

describe("applyRound", () => {
  it("builds the streak on clean rounds and applies the multiplier", () => {
    let state = initialCombo();
    const gains: number[] = [];
    for (let i = 0; i < 5; i++) {
      const step = applyRound(state, "clean", 10);
      gains.push(step.gained);
      state = step.state;
    }
    expect(gains).toEqual([10, 10, 15, 15, 20]);
    expect(state).toMatchObject({ streak: 5, best: 5, rounds: 5, correct: 5, baseXp: 50, bonusXp: 20 });
  });

  it("holds the streak on a shaky round, and breaks it on a miss", () => {
    expect(run(["clean", "clean", "shaky"]).streak).toBe(2);
    const broken = run(["clean", "clean", "clean", "miss"]);
    expect(broken.streak).toBe(0);
    expect(broken.best).toBe(3);
    expect(broken.correct).toBe(3);
  });

  it("flags the moment a tier is reached, and the moment a real streak breaks", () => {
    const two = run(["clean", "clean"]);
    expect(applyRound(two, "clean", 10).tierUp).toBe(true);
    expect(applyRound(two, "miss", 10).broke).toBe(true);
    expect(applyRound(run(["clean"]), "miss", 10).broke).toBe(false);
  });

  it("never multiplies a miss", () => {
    expect(applyRound(run(Array(8).fill("clean")), "miss", 10).gained).toBe(10);
  });

  it("caps the bonus per round and per session — a client cannot mint XP", () => {
    const hot = run(Array(8).fill("clean"));
    expect(applyRound(hot, "clean", 100).gained).toBe(100 + MAX_BONUS_PER_ROUND);
    const endless = run(Array(200).fill("clean"), 100);
    expect(endless.bonusXp).toBe(MAX_SESSION_BONUS);
  });
});
