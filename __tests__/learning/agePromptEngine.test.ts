import { describe, expect, it } from "vitest";
import { buildLessonPrompt } from "@/lib/learning/agePromptEngine";
import { LessonBlockContentSchema } from "@/lib/validations/learning";
import type { LessonBlockContent } from "@/types/learning";

const BASE_PARAMS = {
  topicTitle: "פיזיקה קוונטית",
  stepTitle: "עקרון אי-הוודאות",
  teachingMode: "STORYTELLING" as const,
};

describe("buildLessonPrompt — age-aware persona", () => {
  it("includes KIDS_8_12-specific guidelines: playful tone and kid-relevant analogies", () => {
    const { system } = buildLessonPrompt({ ...BASE_PARAMS, userAgeGroup: "KIDS_8_12" });
    expect(system).toContain("8-12");
    expect(system).toContain("מיינקראפט");
    expect(system).toContain("פורטנייט");
    expect(system).toContain("גיבורי-על");
  });

  it("includes TEENS_13_18-specific guidelines: direct tone and cyber/startup analogies", () => {
    const { system } = buildLessonPrompt({ ...BASE_PARAMS, userAgeGroup: "TEENS_13_18" });
    expect(system).toContain("13-18");
    expect(system).toContain("בגובה העיניים");
    expect(system).toContain("סייבר");
    expect(system).toContain("סטארט-אפ");
  });

  it("includes ADULTS_19_PLUS-specific guidelines: intellectual depth and primary sources", () => {
    const { system } = buildLessonPrompt({ ...BASE_PARAMS, userAgeGroup: "ADULTS_19_PLUS" });
    expect(system).toContain("19");
    expect(system).toContain("מקורות ראשוניים");
    expect(system).toContain("פודקאסט");
  });

  it("produces a materially different system prompt per age group for the same topic", () => {
    const kids = buildLessonPrompt({ ...BASE_PARAMS, userAgeGroup: "KIDS_8_12" }).system;
    const teens = buildLessonPrompt({ ...BASE_PARAMS, userAgeGroup: "TEENS_13_18" }).system;
    const adults = buildLessonPrompt({ ...BASE_PARAMS, userAgeGroup: "ADULTS_19_PLUS" }).system;
    expect(kids).not.toBe(teens);
    expect(teens).not.toBe(adults);
    expect(kids).not.toBe(adults);
  });
});

describe("buildLessonPrompt — teaching mode directives", () => {
  it.each([
    ["STORYTELLING", "דרמה כרונולוגית"],
    ["PRACTICAL", "ישר לעניין"],
    ["ANALOGIES", "דימוי מהעולם הפיזי"],
    ["SOCRATIC", "שאלה מאתגרת"],
  ] as const)("includes the %s mode's structural directive", (teachingMode, expectedPhrase) => {
    const { system } = buildLessonPrompt({ ...BASE_PARAMS, userAgeGroup: "ADULTS_19_PLUS", teachingMode });
    expect(system).toContain(expectedPhrase);
  });
});

describe("buildLessonPrompt — topic/step and JSON-shape requirements", () => {
  it("carries the topic and step titles into the user prompt", () => {
    const { user } = buildLessonPrompt({ ...BASE_PARAMS, userAgeGroup: "ADULTS_19_PLUS" });
    expect(user).toContain("פיזיקה קוונטית");
    expect(user).toContain("עקרון אי-הוודאות");
  });

  it("folds a customEmphasis into the user prompt when given, and omits it when absent", () => {
    const withEmphasis = buildLessonPrompt({ ...BASE_PARAMS, userAgeGroup: "ADULTS_19_PLUS", customEmphasis: "תתמקד במתמטיקה" });
    expect(withEmphasis.user).toContain("תתמקד במתמטיקה");

    const without = buildLessonPrompt({ ...BASE_PARAMS, userAgeGroup: "ADULTS_19_PLUS" });
    expect(without.user).not.toContain("דגש מיוחד");
  });

  it("directs the model to return only valid JSON and warns against code-fenced strings", () => {
    const { system } = buildLessonPrompt({ ...BASE_PARAMS, userAgeGroup: "ADULTS_19_PLUS" });
    expect(system).toContain("JSON");
    expect(system).toContain("code fence");
  });

  it("warns against fabricating external links/media rather than omitting them", () => {
    // A real, live-caught issue: a generated youtubeVideoId that pointed at
    // no real video. Optional fields should be left out, not guessed.
    const { system } = buildLessonPrompt({ ...BASE_PARAMS, userAgeGroup: "ADULTS_19_PLUS" });
    expect(system).toContain("youtubeVideoId");
    expect(system).toContain("אל תמציא");
  });
});

// --- LessonBlockContentSchema ------------------------------------------

function validPayload(): LessonBlockContent {
  return {
    originStory: "סיפור המקור של עקרון אי-הוודאות.",
    pioneers: [
      {
        id: "p1",
        name: "ורנר הייזנברג",
        role: "פיזיקאי",
        historicalEra: "המאה ה-20",
        bio: "פיתח את עקרון אי-הוודאות.",
        famousQuote: "מה שאנחנו רואים אינו הטבע עצמו.",
        unusualFact: "הוא כתב את התיאוריה בזמן שסבל מקדחת חושים.",
        externalLinks: [{ title: "ערך בוויקיפדיה", url: "https://he.wikipedia.org/wiki/הייזנברג", type: "article" }],
      },
    ],
    coreContent: "הסבר מעמיק על עקרון אי-הוודאות.",
    blooperOrDisaster: "טעות מפורסמת שקרתה בדרך.",
    mindBlowingTrivia: ["עובדה מפתיעה ראשונה", "עובדה מפתיעה שנייה"],
    memeData: { jokeText: "בדיחה על אי-ודאות." },
    inAppMedia: {},
    inlineCheckpoints: [
      {
        id: "c1",
        question: "מה עקרון אי-הוודאות אומר?",
        options: ["תשובה א", "תשובה ב", "תשובה ג", "תשובה ד"],
        correctIndex: 1,
        explanation: "ההסבר לתשובה הנכונה.",
      },
    ],
  };
}

describe("LessonBlockContentSchema", () => {
  it("validates a complete, well-formed payload", () => {
    const result = LessonBlockContentSchema.safeParse(validPayload());
    expect(result.success).toBe(true);
  });

  it("flags a missing required top-level field (coreContent)", () => {
    const payload = validPayload() as Partial<LessonBlockContent>;
    delete payload.coreContent;
    const result = LessonBlockContentSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join(".") === "coreContent")).toBe(true);
    }
  });

  it("flags a checkpoint with fewer than 4 options", () => {
    const payload = validPayload();
    payload.inlineCheckpoints[0].options = ["רק שתי אפשרויות", "שנייה"];
    const result = LessonBlockContentSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("flags a correctIndex outside the 0-3 range", () => {
    const payload = validPayload();
    payload.inlineCheckpoints[0].correctIndex = 4;
    const result = LessonBlockContentSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("flags a pioneer missing a required field (bio)", () => {
    const payload = validPayload();
    // @ts-expect-error — deliberately malformed for the test
    delete payload.pioneers[0].bio;
    const result = LessonBlockContentSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("accepts an empty pioneers/trivia/checkpoints array — a lesson can validly have none of these", () => {
    const payload = { ...validPayload(), pioneers: [], mindBlowingTrivia: [], inlineCheckpoints: [] };
    const result = LessonBlockContentSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("rejects a non-URL externalLink.url", () => {
    const payload = validPayload();
    payload.pioneers[0].externalLinks[0].url = "not-a-url";
    const result = LessonBlockContentSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});
