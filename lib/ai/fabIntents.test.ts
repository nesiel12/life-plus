import { describe, expect, it } from "vitest";
import {
  AutoActionSchema,
  EXECUTION_MODE,
  FAB_INTENTS,
  FabModelOutputSchema,
  MIN_CONFIDENCE,
  MODEL_INTENTS,
  describeFabAction,
  isSosMessage,
} from "@/lib/ai/fabIntents";

describe("isSosMessage", () => {
  it.each([
    "קשה לי",
    "קשה לי עכשיו",
    "קשה לי עכשיו!",
    "  קשה לי   ממש  עכשיו... ",
    "אני ממש לא מצליח",
    "לא יכול יותר",
    "צריך עזרה",
    "SOS",
    "sos!!",
    "קָשֶׁה לִי", // niqqud is stripped
    "😔 קשה לי",
  ])("recognises %j", (text) => {
    expect(isSosMessage(text)).toBe(true);
  });

  it.each([
    "קשה לי להבין את הפרק",
    "קשה לי לקום בבוקר",
    "שתיתי כוס מים",
    "תזכיר לי להתקשר לרופא",
    "מה זה קשה לי",
    "לא מצליח להירדם בלילה",
    "",
    "   ",
    "!!!",
  ])("leaves %j to the normal pipeline", (text) => {
    expect(isSosMessage(text)).toBe(false);
  });

  it("never matches a long message, however distressed the opening", () => {
    expect(isSosMessage("קשה לי עכשיו אני לא יודע מה לעשות עם עצמי היום")).toBe(false);
  });
});

describe("intent policy", () => {
  it("has a mode and a confidence floor for every intent", () => {
    for (const intent of FAB_INTENTS) {
      expect(EXECUTION_MODE[intent]).toBeDefined();
      expect(MIN_CONFIDENCE[intent]).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps the SOS intent out of what the model can choose", () => {
    expect(MODEL_INTENTS).not.toContain("PERSONAL_SPACE_SOS");
    expect(FabModelOutputSchema.safeParse({ intent: "PERSONAL_SPACE_SOS", confidence: 1 }).success).toBe(false);
  });

  it("auto-commits only the low-stakes logs, and confirms calendar-adjacent and social ones", () => {
    const auto = FAB_INTENTS.filter((i) => EXECUTION_MODE[i] === "auto");
    expect(auto).toEqual(["LOG_WATER", "LOG_EXPENSE", "ADD_TASK"]);
    expect(EXECUTION_MODE.CRM_INTERACTION).toBe("confirm");
    expect(EXECUTION_MODE.PERSONAL_SPACE_SOS).toBe("sos");
    expect(EXECUTION_MODE.GENERAL_QUERY).toBe("handoff");
  });

  it("holds money to a higher bar than the other quick logs", () => {
    expect(MIN_CONFIDENCE.LOG_EXPENSE).toBeGreaterThan(MIN_CONFIDENCE.LOG_WATER);
  });
});

describe("payload bounds", () => {
  const water = (amountMl: number) => AutoActionSchema.safeParse({ intent: "LOG_WATER", payload: { amountMl }, confidence: 0.9 });

  it("accepts a glass and rejects a nonsense volume", () => {
    expect(water(250).success).toBe(true);
    expect(water(0).success).toBe(false);
    expect(water(50_000).success).toBe(false);
    expect(water(250.5).success).toBe(false);
  });

  it("rejects a non-positive or off-list expense", () => {
    const expense = (amount: number, category: string) =>
      AutoActionSchema.safeParse({ intent: "LOG_EXPENSE", payload: { amount, category, title: "קפה" }, confidence: 0.9 });
    expect(expense(12, "dining").success).toBe(true);
    expect(expense(-12, "dining").success).toBe(false);
    expect(expense(0, "dining").success).toBe(false);
    expect(expense(12, "salary").success).toBe(false); // an income key
    expect(expense(12, "Groceries").success).toBe(false);
  });
});

describe("describeFabAction", () => {
  it("states exactly what the payload says", () => {
    expect(
      describeFabAction({ intent: "LOG_WATER", payload: { amountMl: 500 }, confidence: 0.9 })
    ).toBe("נרשמו 500 מ״ל מים");
    expect(
      describeFabAction({
        intent: "LOG_EXPENSE",
        payload: { amount: 40, category: "dining", title: "קפה" },
        confidence: 0.9,
      })
    ).toBe("הוצאה: קפה · 40 ₪ · מסעדות ובתי קפה");
    expect(
      describeFabAction({
        intent: "ADD_TASK",
        payload: { title: "להתקשר לרופא", dueAt: "2026-09-21T09:00", priority: "high" },
        confidence: 0.9,
      })
    ).toBe("משימה: להתקשר לרופא · 2026-09-21 09:00 · דחוף");
  });
});
