import { describe, expect, it } from "vitest";
import { buildMemoryPrompt } from "@/lib/ai/agents/memoriesAgent";

describe("buildMemoryPrompt", () => {
  const base = { yearsAgo: 2, dateLabel: "3 בספטמבר 2024" };

  it("always states the date and how long ago it was", () => {
    const prompt = buildMemoryPrompt(base);
    expect(prompt).toContain("3 בספטמבר 2024");
    expect(prompt).toContain("לפני 2 שנים");
  });

  it("includes each kind of context when present", () => {
    const prompt = buildMemoryPrompt({
      ...base,
      people: ["שרה", "דוד"],
      moments: ["טיול בצפון"],
      events: ["ארוחת ערב משפחתית"],
    });
    expect(prompt).toContain("שרה, דוד");
    expect(prompt).toContain("טיול בצפון");
    expect(prompt).toContain("ארוחת ערב משפחתית");
  });

  it("says so explicitly when there is no context, rather than leaving a blank", () => {
    // A blank would invite the model to fill the silence by inventing events —
    // the exact failure this feature must not have.
    const prompt = buildMemoryPrompt(base);
    expect(prompt).toContain("אין הקשר נוסף");
  });

  it("does not claim absent context when only some kinds are present", () => {
    const prompt = buildMemoryPrompt({ ...base, people: ["שרה"] });
    expect(prompt).not.toContain("אין הקשר נוסף");
    expect(prompt).toContain("שרה");
  });

  it("treats empty arrays the same as missing", () => {
    const prompt = buildMemoryPrompt({ ...base, people: [], moments: [], events: [] });
    expect(prompt).toContain("אין הקשר נוסף");
  });
});
