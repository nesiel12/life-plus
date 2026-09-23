import { describe, expect, it } from "vitest";
import { CHECKPOINT_XP, PIONEER_EASTER_EGG_XP, checkpointCelebrationFor, easterEggCelebrationFor } from "@/lib/learning/masterclassXp";

describe("CHECKPOINT_XP", () => {
  it("is a positive reward", () => {
    expect(CHECKPOINT_XP).toBeGreaterThan(0);
  });
});

describe("checkpointCelebrationFor", () => {
  it("celebrates a wrong-to-correct transition", () => {
    expect(checkpointCelebrationFor({ wasCorrectBefore: false, isCorrectNow: true })).toBe("correct");
  });

  it("does not re-celebrate an already-correct answer confirmed again", () => {
    expect(checkpointCelebrationFor({ wasCorrectBefore: true, isCorrectNow: true })).toBe("none");
  });

  it("does not celebrate a wrong answer", () => {
    expect(checkpointCelebrationFor({ wasCorrectBefore: false, isCorrectNow: false })).toBe("none");
  });

  it("does not celebrate a correct answer changed to wrong on retry", () => {
    expect(checkpointCelebrationFor({ wasCorrectBefore: true, isCorrectNow: false })).toBe("none");
  });
});

describe("PIONEER_EASTER_EGG_XP", () => {
  it("is a positive reward", () => {
    expect(PIONEER_EASTER_EGG_XP).toBeGreaterThan(0);
  });
});

describe("easterEggCelebrationFor", () => {
  it("celebrates the first claim", () => {
    expect(easterEggCelebrationFor({ alreadyClaimed: false })).toBe("claimed");
  });

  it("does not re-celebrate a repeat claim", () => {
    expect(easterEggCelebrationFor({ alreadyClaimed: true })).toBe("none");
  });
});
