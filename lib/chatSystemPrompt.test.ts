import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/lib/chatSystemPrompt";
import type { Database } from "@/types/database";

type PersonalDnaRow = Database["public"]["Tables"]["personal_dna"]["Row"];

function dnaRow(patch: Partial<PersonalDnaRow>): PersonalDnaRow {
  return {
    user_id: "u1",
    peak_focus_hours: null,
    learning_style: null,
    family_check_in_interval_days: null,
    habit_notes: [],
    ...patch,
  } as PersonalDnaRow;
}

describe("buildSystemPrompt", () => {
  it("returns the base prompt when there is no personalDNA row", () => {
    const prompt = buildSystemPrompt(null);
    expect(prompt).toContain("You are Atlas");
    expect(prompt).not.toContain("What you know about him personally");
  });

  it("returns the base prompt when the row has no fields set", () => {
    const prompt = buildSystemPrompt(dnaRow({}));
    expect(prompt).not.toContain("What you know about him personally");
  });

  it("includes peak focus hours when set", () => {
    const prompt = buildSystemPrompt(dnaRow({ peak_focus_hours: "בבוקר מוקדם" }));
    expect(prompt).toContain("בבוקר מוקדם");
  });

  it("includes learning style and habit notes when set", () => {
    const prompt = buildSystemPrompt(
      dnaRow({ learning_style: "בהאזנה", habit_notes: ["שותה קפה לפני לימוד"] })
    );
    expect(prompt).toContain("בהאזנה");
    expect(prompt).toContain("שותה קפה לפני לימוד");
  });
});
