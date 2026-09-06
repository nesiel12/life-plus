import { describe, expect, it } from "vitest";
import {
  buildStages,
  clampStage,
  stageLabel,
  stageProgress,
} from "@/lib/learning/courseStages";
import type { CourseModule } from "@/lib/ai/courseModule";

function courseModule(overrides: Partial<CourseModule> = {}): CourseModule {
  return {
    title: "יסודות ההשקעה",
    intro: "פתיחה ארוכה על הנושא.",
    sections: [
      { heading: "ריבית דריבית", body: "גוף ההסבר." },
      { heading: "פיזור סיכונים", body: "גוף ההסבר השני." },
    ],
    keyTakeaways: ["נקודה ראשונה", "נקודה שנייה"],
    quiz: [
      { question: "שאלה?", options: ["א", "ב", "ג", "ד"], correctIndex: 0, explanation: "כי כך." },
    ],
    ...overrides,
  } as CourseModule;
}

describe("buildStages", () => {
  it("orders intro, sections, takeaways, quiz", () => {
    expect(buildStages(courseModule()).map((s) => s.kind)).toEqual([
      "intro",
      "section",
      "section",
      "takeaways",
      "quiz",
    ]);
  });

  it("carries the intro title and body", () => {
    const [intro] = buildStages(courseModule());
    expect(intro).toEqual({ kind: "intro", title: "יסודות ההשקעה", body: "פתיחה ארוכה על הנושא." });
  });

  it("keeps each section's heading and body", () => {
    const stages = buildStages(courseModule());
    expect(stages[1]).toEqual({ kind: "section", heading: "ריבית דריבית", body: "גוף ההסבר." });
  });

  // An empty stage costs a "next" press to walk past nothing.
  it("omits takeaways when there are none", () => {
    const kinds = buildStages(courseModule({ keyTakeaways: [] })).map((s) => s.kind);
    expect(kinds).not.toContain("takeaways");
  });

  it("omits takeaways that are only whitespace", () => {
    const kinds = buildStages(courseModule({ keyTakeaways: ["  ", ""] })).map((s) => s.kind);
    expect(kinds).not.toContain("takeaways");
  });

  it("keeps the non-empty takeaways when some are blank", () => {
    const stages = buildStages(courseModule({ keyTakeaways: ["ממשי", "  "] }));
    const takeaways = stages.find((s) => s.kind === "takeaways");
    expect(takeaways).toEqual({ kind: "takeaways", items: ["ממשי"] });
  });

  it("omits the quiz when there are no questions", () => {
    const kinds = buildStages(courseModule({ quiz: [] })).map((s) => s.kind);
    expect(kinds).not.toContain("quiz");
  });

  it("skips a section that is entirely empty", () => {
    const stages = buildStages(
      courseModule({ sections: [{ heading: "", body: "" }, { heading: "אמיתי", body: "גוף" }] })
    );
    expect(stages.filter((s) => s.kind === "section")).toHaveLength(1);
  });

  it("keeps a section that has a heading but no body", () => {
    const stages = buildStages(courseModule({ sections: [{ heading: "כותרת", body: "" }] }));
    expect(stages.filter((s) => s.kind === "section")).toHaveLength(1);
  });

  // A module always has an intro, so there is always somewhere to stand.
  it("still produces the intro stage for an otherwise empty module", () => {
    const stages = buildStages(courseModule({ sections: [], keyTakeaways: [], quiz: [] }));
    expect(stages.map((s) => s.kind)).toEqual(["intro"]);
  });

  it("tolerates missing arrays rather than throwing", () => {
    const bare = { title: "כותרת", intro: "פתיחה" } as CourseModule;
    expect(() => buildStages(bare)).not.toThrow();
    expect(buildStages(bare).map((s) => s.kind)).toEqual(["intro"]);
  });
});

describe("clampStage", () => {
  it("keeps an in-range index", () => {
    expect(clampStage(2, 5)).toBe(2);
  });

  it("clamps below and above", () => {
    expect(clampStage(-4, 5)).toBe(0);
    expect(clampStage(99, 5)).toBe(4);
  });

  it("returns 0 for an empty course", () => {
    expect(clampStage(3, 0)).toBe(0);
  });

  it("rejects non-finite and fractional input", () => {
    expect(clampStage(NaN, 5)).toBe(0);
    expect(clampStage(Infinity, 5)).toBe(0);
    expect(clampStage(2.7, 5)).toBe(2);
  });
});

describe("stageLabel", () => {
  it("names each kind, using the heading for a section", () => {
    const stages = buildStages(courseModule());
    expect(stages.map(stageLabel)).toEqual([
      "פתיחה",
      "ריבית דריבית",
      "פיזור סיכונים",
      "עיקרי הדברים",
      "בוחן",
    ]);
  });
});

describe("stageProgress", () => {
  // Claiming progress before anything has been read makes the bar worthless.
  it("is 0 on the first stage", () => {
    expect(stageProgress(0, 5)).toBe(0);
  });

  it("is 1 on the last stage", () => {
    expect(stageProgress(4, 5)).toBe(1);
  });

  it("is linear in between", () => {
    expect(stageProgress(2, 5)).toBe(0.5);
  });

  it("does not divide by zero for a one-stage course", () => {
    expect(stageProgress(0, 1)).toBe(0);
    expect(stageProgress(0, 0)).toBe(0);
  });

  it("clamps an out-of-range index", () => {
    expect(stageProgress(99, 5)).toBe(1);
    expect(stageProgress(-3, 5)).toBe(0);
  });
});
