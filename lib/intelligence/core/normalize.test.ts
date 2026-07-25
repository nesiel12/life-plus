import { describe, expect, it } from "vitest";
import { buildIntelligenceSignals, filterSignalsByCategory } from "@/lib/intelligence/core/normalize";
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
    scheduledEvents: [],
    relevantMemory: [],
    relationshipSignals: [],
    peopleRoster: [],
    personalPatterns: [],
    recommendationInsights: [],
    ...patch,
  };
}

describe("buildIntelligenceSignals", () => {
  it("returns nothing for an empty context", () => {
    expect(buildIntelligenceSignals(context({}))).toEqual([]);
  });

  it("produces one signal per personalDNA field that's actually set", () => {
    const signals = buildIntelligenceSignals(
      context({
        personalDNA: dnaRow({
          peak_focus_hours: "בבוקר",
          learning_style: "בהאזנה",
          habit_notes: ["הרגל א", "הרגל ב"],
          sleep_notes: "ישן מוקדם",
          career_notes: "מתכנת",
          motivation_triggers: ["דדליין"],
        }),
      })
    );
    // peak_focus_hours, learning_style, sleep_notes, career_notes (1 each) +
    // 2 habit_notes + 1 motivation_trigger = 7.
    expect(signals.filter((s) => s.category === "personalDNA")).toHaveLength(7);
  });

  it("peopleRoster does not itself become a ranked signal — it feeds the identity prompt directly, not the briefing", () => {
    const signals = buildIntelligenceSignals(context({ peopleRoster: ["יסמין (בת זוג)"] }));
    expect(signals).toEqual([]);
  });

  it("maps every AtlasContext field to its own category", () => {
    const signals = buildIntelligenceSignals(
      context({
        activeGoals: ["יעד"],
        lifeAreas: [{ key: "faith", label: "אמונה", score: 60, colorVar: "--accent-faith" }],
        upcomingEvents: ["אירוע"],
        scheduledEvents: ["פגישה"],
        relationshipSignals: ["קשר"],
        relevantMemory: ["זיכרון"],
        personalPatterns: ["דפוס"],
        recommendationInsights: ["משוב"],
      })
    );
    const categories = signals.map((s) => s.category).sort();
    expect(categories).toEqual(
      [
        "goal",
        "lifeArea",
        "memory",
        "personalPattern",
        "recommendation",
        "relationship",
        "scheduledEvent",
        "upcomingEvent",
      ].sort()
    );
  });

  it("assigns every signal a unique id", () => {
    const signals = buildIntelligenceSignals(
      context({ activeGoals: ["a", "b"], relevantMemory: ["c", "d"] })
    );
    const ids = signals.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("boosts importance for a life area below the weak-area threshold", () => {
    const signals = buildIntelligenceSignals(
      context({
        lifeAreas: [
          { key: "faith", label: "אמונה", score: 20, colorVar: "--accent-faith" },
          { key: "family", label: "משפחה", score: 80, colorVar: "--accent-family" },
        ],
      })
    );
    const weak = signals.find((s) => s.title === "אמונה");
    const strong = signals.find((s) => s.title === "משפחה");
    expect(weak!.importance).toBeGreaterThan(strong!.importance);
  });

  it("keeps every signal's numeric fields within 0..1", () => {
    const signals = buildIntelligenceSignals(
      context({
        personalDNA: dnaRow({ peak_focus_hours: "x" }),
        activeGoals: ["a"],
        lifeAreas: [{ key: "faith", label: "אמונה", score: 10, colorVar: "--accent-faith" }],
        relevantMemory: ["m"],
      })
    );
    for (const signal of signals) {
      expect(signal.importance).toBeGreaterThanOrEqual(0);
      expect(signal.importance).toBeLessThanOrEqual(1);
      expect(signal.confidence).toBeGreaterThanOrEqual(0);
      expect(signal.confidence).toBeLessThanOrEqual(1);
      expect(signal.recency).toBeGreaterThanOrEqual(0);
      expect(signal.recency).toBeLessThanOrEqual(1);
    }
  });
});

describe("filterSignalsByCategory", () => {
  it("keeps only the requested categories", () => {
    const signals = buildIntelligenceSignals(context({ activeGoals: ["a"], relevantMemory: ["b"] }));
    const filtered = filterSignalsByCategory(signals, ["goal"]);
    expect(filtered.every((s) => s.category === "goal")).toBe(true);
    expect(filtered.length).toBeGreaterThan(0);
  });

  it("returns an empty array when no signal matches", () => {
    const signals = buildIntelligenceSignals(context({ activeGoals: ["a"] }));
    expect(filterSignalsByCategory(signals, ["upcomingEvent"])).toEqual([]);
  });
});
