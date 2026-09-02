import { describe, expect, it } from "vitest";
import {
  MAX_ONBOARDING_TURNS,
  buildOnboardingSystemPrompt,
  deriveCoveredTopics,
  isOnboardingComplete,
  isValidBirthday,
  mergePersonalDnaPatch,
} from "@/lib/onboarding/deepOnboarding";
import { EMPTY_PERSONAL_DNA } from "@/types";
import type { PersonalDNA } from "@/types";

const EMPTY_DNA: PersonalDNA = EMPTY_PERSONAL_DNA;

describe("deriveCoveredTopics", () => {
  it("returns nothing covered from a blank profile with no family", () => {
    expect(deriveCoveredTopics({ personalDNA: EMPTY_DNA, hasFamily: false }, [])).toEqual([]);
  });

  it("marks family covered when at least one person already exists", () => {
    expect(deriveCoveredTopics({ personalDNA: EMPTY_DNA, hasFamily: true }, [])).toEqual(["family"]);
  });

  it("marks a topic covered from real personal_dna fields, independent of family", () => {
    const dna: PersonalDNA = { ...EMPTY_DNA, careerNotes: "בונה מוצרי AI", sleepNotes: "הולך לישון מוקדם" };
    expect(deriveCoveredTopics({ personalDNA: dna, hasFamily: false }, [])).toEqual(["career", "sleep"]);
  });

  it("treats an explicitly skipped topic as covered even with no real data", () => {
    expect(deriveCoveredTopics({ personalDNA: EMPTY_DNA, hasFamily: false }, ["career"])).toEqual(["career"]);
  });

  it("covers every topic once every field and family are present", () => {
    const dna: PersonalDNA = {
      habitNotes: ["קם מוקדם"],
      motivationTriggers: [],
      chronotype: {},
      corePriorities: [],
      careerNotes: "מהנדס תוכנה",
      sleepNotes: "7 שעות בלילה",
      peakFocusHours: "06:00-09:00",
    };
    expect(deriveCoveredTopics({ personalDNA: dna, hasFamily: true }, [])).toEqual([
      "family",
      "career",
      "habits",
      "sleep",
      "focus",
    ]);
  });
});

describe("isOnboardingComplete", () => {
  it("is not complete with only some topics covered, well under the turn cap", () => {
    expect(isOnboardingComplete(["family", "career"], 2)).toBe(false);
  });

  it("is complete once every topic is covered", () => {
    expect(isOnboardingComplete(["family", "career", "habits", "sleep", "focus"], 3)).toBe(true);
  });

  it("is forced complete at the turn cap regardless of what's covered", () => {
    expect(isOnboardingComplete(["family"], MAX_ONBOARDING_TURNS)).toBe(true);
  });

  it("is not complete one turn before the cap with topics still missing", () => {
    expect(isOnboardingComplete(["family"], MAX_ONBOARDING_TURNS - 1)).toBe(false);
  });
});

describe("mergePersonalDnaPatch", () => {
  it("keeps existing scalar fields when nothing new was extracted this turn", () => {
    const existing: PersonalDNA = { ...EMPTY_DNA, careerNotes: "existing" };
    const patch = mergePersonalDnaPatch(existing, {
      people: [],
      habitNotes: [],
      motivationTriggers: [],
    });
    expect(patch.careerNotes).toBe("existing");
  });

  it("overwrites a scalar field once the model extracts a real new value", () => {
    const existing: PersonalDNA = { ...EMPTY_DNA, careerNotes: "existing" };
    const patch = mergePersonalDnaPatch(existing, {
      people: [],
      habitNotes: [],
      motivationTriggers: [],
      careerNotes: "updated",
    });
    expect(patch.careerNotes).toBe("updated");
  });

  it("accumulates and dedupes array fields instead of replacing them", () => {
    const existing: PersonalDNA = { ...EMPTY_PERSONAL_DNA, habitNotes: ["קם מוקדם"] };
    const patch = mergePersonalDnaPatch(existing, {
      people: [],
      habitNotes: ["קם מוקדם", "מתפלל בבוקר"],
      motivationTriggers: ["דדליין"],
    });
    expect(patch.habitNotes).toEqual(["קם מוקדם", "מתפלל בבוקר"]);
    expect(patch.motivationTriggers).toEqual(["דדליין"]);
  });
});

describe("isValidBirthday", () => {
  it("accepts a well-formed MM-DD birthday", () => {
    expect(isValidBirthday("05-14")).toBe(true);
  });

  it("rejects a missing or malformed birthday instead of throwing", () => {
    expect(isValidBirthday(undefined)).toBe(false);
    expect(isValidBirthday("14 במאי")).toBe(false);
    expect(isValidBirthday("2026-05-14")).toBe(false);
  });
});

describe("buildOnboardingSystemPrompt", () => {
  it("lists only the still-uncovered topics", () => {
    const prompt = buildOnboardingSystemPrompt({ displayName: "נסיאל", covered: ["family", "career"], turnsAsked: 2 });
    expect(prompt).toContain("הרגלים יומיומיים");
    expect(prompt).toContain("שינה");
    expect(prompt).toContain("שעות ריכוז ואנרגיה");
    expect(prompt).not.toContain("נושאים שעדיין לא נענו: משפחה");
  });

  it("instructs a graceful wrap-up once every topic is covered", () => {
    const prompt = buildOnboardingSystemPrompt({
      displayName: "נסיאל",
      covered: ["family", "career", "habits", "sleep", "focus"],
      turnsAsked: 4,
    });
    expect(prompt).toContain("כל הנושאים כבר כוסו");
  });
});
