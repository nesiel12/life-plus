import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/lib/chatSystemPrompt";
import type { AtlasContext } from "@/lib/context/types";
import type { Database } from "@/types/database";

type PersonalDnaRow = Database["public"]["Tables"]["personal_dna"]["Row"];

function dnaRow(patch: Partial<PersonalDnaRow>): PersonalDnaRow {
  return {
    user_id: "u1",
    peak_focus_hours: null,
    learning_style: null,
    family_check_in_interval_days: null,
    habit_notes: [],
    sleep_notes: null,
    career_notes: null,
    motivation_triggers: [],
    ...patch,
  } as PersonalDnaRow;
}

function context(patch: Partial<AtlasContext>): AtlasContext {
  return {
    personalDNA: null,
    activeGoals: [],
    lifeAreas: [],
    upcomingEvents: [],
    relevantMemory: [],
    relationshipSignals: [],
    peopleRoster: [],
    scheduledEvents: [],
    personalPatterns: [],
    recommendationInsights: [],
    ...patch,
  };
}

// Regression suite for chat's Intelligence Engine wiring (docs/ATLAS_
// ARCHITECTURE_VISION.md §9) — verifies every AtlasContext field still
// reaches the prompt now that ordering/section-selection moved from
// hand-written formatContextSection calls to buildIntelligenceSignals ->
// rankSignals -> formatSignalsForPrompt. Ranking correctness itself
// (scoring, tie-breaking, stability) is covered in lib/intelligence/core's
// own tests — this file only proves the wiring, not the algorithm.
describe("buildSystemPrompt", () => {
  it("returns exactly the base prompt for an empty context, with no top signals", () => {
    const { prompt, topSignals } = buildSystemPrompt();
    expect(prompt).toContain("You are Life Plus");
    expect(prompt).not.toContain("ranked by importance");
    expect(topSignals).toEqual([]);
  });

  it("returns exactly the base prompt when personalDNA has no fields set", () => {
    const { prompt } = buildSystemPrompt(context({ personalDNA: dnaRow({}) }));
    expect(prompt).not.toContain("ranked by importance");
  });

  it("includes peak focus hours when set", () => {
    const { prompt } = buildSystemPrompt(context({ personalDNA: dnaRow({ peak_focus_hours: "בבוקר מוקדם" }) }));
    expect(prompt).toContain("בבוקר מוקדם");
  });

  it("includes learning style and habit notes when set", () => {
    const { prompt } = buildSystemPrompt(
      context({ personalDNA: dnaRow({ learning_style: "בהאזנה", habit_notes: ["שותה קפה לפני לימוד"] }) })
    );
    expect(prompt).toContain("בהאזנה");
    expect(prompt).toContain("שותה קפה לפני לימוד");
  });

  it("includes sleep notes, career notes, and motivation triggers when set (Deep Onboarding fields)", () => {
    const { prompt } = buildSystemPrompt(
      context({
        personalDNA: dnaRow({
          sleep_notes: "הולך לישון מוקדם",
          career_notes: "בונה מוצרי AI",
          motivation_triggers: ["דדליין קרוב"],
        }),
      })
    );
    expect(prompt).toContain("הולך לישון מוקדם");
    expect(prompt).toContain("בונה מוצרי AI");
    expect(prompt).toContain("דדליין קרוב");
  });

  it("names real people from peopleRoster in the identity paragraph instead of a hardcoded list", () => {
    const { prompt } = buildSystemPrompt(context({ peopleRoster: ["יסמין (בת זוג)"] }));
    expect(prompt).toContain("יסמין (בת זוג)");
  });

  it("omits the people sentence entirely when no one is on file, rather than a fabricated list", () => {
    const { prompt } = buildSystemPrompt();
    expect(prompt).not.toContain("closest to him");
  });

  it("includes retrieved memory when present", () => {
    const { prompt } = buildSystemPrompt(context({ relevantMemory: ["רגע (משפחה, 2026-07-01): שיחה עם אבא"] }));
    expect(prompt).toContain("ranked by importance");
    expect(prompt).toContain("שיחה עם אבא");
  });

  it("includes active goals, life areas, upcoming events, and relationship signals", () => {
    const { prompt } = buildSystemPrompt(
      context({
        activeGoals: ["ללמוד מסכת חדשה — 40% הושלם"],
        lifeAreas: [{ key: "faith", label: "אמונה", score: 30, colorVar: "--accent-faith" }],
        upcomingEvents: ["יום הולדת לאמא (2026-08-01)"],
        relationshipSignals: ["לא יצרת קשר עם דניאל כבר 12 ימים"],
      })
    );
    expect(prompt).toContain("ללמוד מסכת חדשה");
    expect(prompt).toContain("אמונה: 30%");
    expect(prompt).toContain("יום הולדת לאמא");
    expect(prompt).toContain("דניאל");
  });

  it("includes inferred personal patterns when present", () => {
    const { prompt } = buildSystemPrompt(
      context({ personalPatterns: ["הרגעים בתחום ידע מתועדים בעיקר בין 18:00–22:00."] })
    );
    expect(prompt).toContain("18:00–22:00");
  });

  it("includes recommendation feedback insights when present", () => {
    const { prompt } = buildSystemPrompt(
      context({ recommendationInsights: ["הצעות ליומן: מתקבלות בכ-80% מהמקרים (4 מתוך 5)."] })
    );
    expect(prompt).toContain("80%");
  });

  it("combines personalDNA and memory together", () => {
    const { prompt } = buildSystemPrompt(
      context({ personalDNA: dnaRow({ learning_style: "בהאזנה" }), relevantMemory: ["תובנה: משהו חשוב"] })
    );
    expect(prompt).toContain("בהאזנה");
    expect(prompt).toContain("משהו חשוב");
  });

  it("surfaces a note when a goal and a relationship signal both rank near the top", () => {
    const { prompt } = buildSystemPrompt(
      context({
        activeGoals: ["סיים פרויקט"],
        relationshipSignals: ["התקשר לאמא"],
      })
    );
    expect(prompt).toContain("Competing priorities");
  });

  it("returns topSignals in the same ranked order reflected in the prompt", () => {
    const { topSignals } = buildSystemPrompt(
      context({
        activeGoals: ["סיים פרויקט"],
        relevantMemory: ["רגע ישן"],
      })
    );
    expect(topSignals.length).toBeGreaterThan(0);
    expect(topSignals[0]).toHaveProperty("score");
    expect(topSignals[0]).toHaveProperty("summary");
  });
});
