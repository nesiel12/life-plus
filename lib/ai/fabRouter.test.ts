import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FabModelOutput } from "@/lib/ai/fabIntents";

const generateStructuredData = vi.fn();
vi.mock("@/lib/ai", () => ({ generateStructuredData: (...args: unknown[]) => generateStructuredData(...args) }));

import { AiQuotaExceededError } from "@/lib/ai/service";
import { buildFabSystemPrompt, decideFromModelOutput, normalizeDueAt, routeFabInput } from "@/lib/ai/fabRouter";

const actor = { kind: "user", userId: "u1" } as const;
const noPerson = async () => null;

// Braces matter: a function returned from beforeEach runs as a teardown hook,
// and mockReset() returns the mock — which would be called once more after
// each test, turning a rejecting mock into an unhandled rejection.
beforeEach(() => {
  generateStructuredData.mockReset();
});

describe("normalizeDueAt", () => {
  it("passes the requested formats through", () => {
    expect(normalizeDueAt("2026-09-21T09:00")).toBe("2026-09-21T09:00");
    expect(normalizeDueAt("2026-09-21")).toBe("2026-09-21");
  });

  it("repairs seconds and zones rather than losing the task", () => {
    expect(normalizeDueAt("2026-09-21T09:00:00")).toBe("2026-09-21T09:00");
    expect(normalizeDueAt("2026-09-21T09:00:00.000Z")).toBe("2026-09-21T09:00");
    expect(normalizeDueAt("2026-09-21 09:00")).toBe("2026-09-21T09:00");
  });

  it("drops what it cannot read", () => {
    expect(normalizeDueAt("מחר בבוקר")).toBeUndefined();
    expect(normalizeDueAt("")).toBeUndefined();
    expect(normalizeDueAt(undefined)).toBeUndefined();
  });
});

describe("decideFromModelOutput", () => {
  it("turns a confident water log into an auto action", () => {
    const decision = decideFromModelOutput({ intent: "LOG_WATER", confidence: 0.95, logWater: { amountMl: 500 } });
    expect(decision).toEqual({
      kind: "auto",
      action: { intent: "LOG_WATER", payload: { amountMl: 500 }, confidence: 0.95 },
    });
  });

  it("never writes on thin confidence, and holds money to a higher bar", () => {
    const water: FabModelOutput = { intent: "LOG_WATER", confidence: 0.6, logWater: { amountMl: 250 } };
    expect(decideFromModelOutput(water)).toEqual({ kind: "handoff", reason: "low_confidence" });

    const expense: FabModelOutput = {
      intent: "LOG_EXPENSE",
      confidence: 0.75, // enough for water, not for money
      logExpense: { amount: 40, category: "dining", title: "קפה" },
    };
    expect(decideFromModelOutput(expense)).toEqual({ kind: "handoff", reason: "low_confidence" });
    expect(decideFromModelOutput({ ...expense, confidence: 0.85 }).kind).toBe("auto");
  });

  it("hands a general request to the existing pipeline whatever the confidence", () => {
    expect(decideFromModelOutput({ intent: "GENERAL_QUERY", confidence: 1 })).toEqual({
      kind: "handoff",
      reason: "general",
    });
  });

  it("does not act when the chosen intent's payload is missing", () => {
    expect(decideFromModelOutput({ intent: "LOG_WATER", confidence: 0.99 })).toEqual({
      kind: "handoff",
      reason: "invalid_payload",
    });
    // Right intent, wrong object — the model filled a different intent's field.
    expect(
      decideFromModelOutput({ intent: "LOG_EXPENSE", confidence: 0.99, logWater: { amountMl: 250 } })
    ).toEqual({ kind: "handoff", reason: "invalid_payload" });
  });

  it("rounds money to agorot and defaults task priority", () => {
    const expense = decideFromModelOutput({
      intent: "LOG_EXPENSE",
      confidence: 0.9,
      logExpense: { amount: 12.3456, category: "transport", title: "דלק" },
    });
    expect(expense.kind === "auto" && expense.action.intent === "LOG_EXPENSE" && expense.action.payload.amount).toBe(12.35);

    const task = decideFromModelOutput({
      intent: "ADD_TASK",
      confidence: 0.9,
      addTask: { title: "להתקשר לרופא", dueAt: "2026-09-21T09:00:00", priority: undefined },
    });
    expect(task).toMatchObject({
      kind: "auto",
      action: { intent: "ADD_TASK", payload: { title: "להתקשר לרופא", dueAt: "2026-09-21T09:00", priority: "normal" } },
    });
  });

  it("keeps a task whose due time is unreadable, minus the time", () => {
    const task = decideFromModelOutput({
      intent: "ADD_TASK",
      confidence: 0.9,
      addTask: { title: "לקנות חלב", dueAt: "אחרי הצהריים", priority: "high" },
    });
    expect(task).toMatchObject({ kind: "auto", action: { payload: { title: "לקנות חלב", priority: "high" } } });
    expect(task.kind === "auto" && "dueAt" in task.action.payload && task.action.payload.dueAt).toBeFalsy();
  });

  it("routes a Torah thought to confirm, not auto — there is no undo for a moment yet", () => {
    const decision = decideFromModelOutput({
      intent: "TORAH_INSIGHT",
      confidence: 0.9,
      torahInsight: { title: "פשט ורמז", content: "חשבתי על ההבדל בין פשט לרמז" },
    });
    expect(decision.kind).toBe("confirm");
  });
});

describe("routeFabInput", () => {
  it("answers SOS locally: no model call, no lookup", async () => {
    const findPerson = vi.fn();
    const decision = await routeFabInput({ text: "קשה לי עכשיו", actor, findPerson });
    expect(decision).toEqual({ kind: "sos" });
    expect(generateStructuredData).not.toHaveBeenCalled();
    expect(findPerson).not.toHaveBeenCalled();
  });

  it("sends anything else to the model with the closed prompt and never lets it see SOS", async () => {
    generateStructuredData.mockResolvedValue({ intent: "LOG_WATER", confidence: 0.9, logWater: { amountMl: 250 } });
    const decision = await routeFabInput({ text: "שתיתי כוס מים", actor, findPerson: noPerson });
    expect(decision.kind).toBe("auto");
    const call = generateStructuredData.mock.calls[0][0];
    expect(call.prompt).toBe("שתיתי כוס מים");
    expect(call.actor).toEqual(actor);
    expect(call.schema.safeParse({ intent: "PERSONAL_SPACE_SOS", confidence: 1 }).success).toBe(false);
  });

  it("degrades a model failure to a handoff instead of losing the input", async () => {
    generateStructuredData.mockRejectedValue(new Error("provider down"));
    expect(await routeFabInput({ text: "שתיתי כוס מים", actor, findPerson: noPerson })).toEqual({
      kind: "handoff",
      reason: "unavailable",
    });
  });

  it("lets an exhausted quota propagate so the route can say so", async () => {
    generateStructuredData.mockRejectedValue(new AiQuotaExceededError("day", "quota", new Date("2026-09-21T00:00:00Z")));
    await expect(routeFabInput({ text: "שתיתי כוס מים", actor, findPerson: noPerson })).rejects.toBeInstanceOf(
      AiQuotaExceededError
    );
  });

  it("proposes a family interaction for a contact that exists", async () => {
    generateStructuredData.mockResolvedValue({
      intent: "CRM_INTERACTION",
      confidence: 0.9,
      crmInteraction: { contactName: "אמא", note: "דיברנו על שבת" },
    });
    const findPerson = vi.fn().mockResolvedValue({ id: "p1", name: "אמא" });
    const decision = await routeFabInput({ text: "דיברתי עם אמא על שבת", actor, findPerson });
    expect(findPerson).toHaveBeenCalledWith("אמא");
    expect(decision).toEqual({
      kind: "confirm",
      action: {
        intent: "CRM_INTERACTION",
        payload: { personId: "p1", personName: "אמא", note: "דיברנו על שבת" },
        confidence: 0.9,
      },
    });
  });

  it("says so when the contact does not exist, rather than guessing one", async () => {
    generateStructuredData.mockResolvedValue({
      intent: "CRM_INTERACTION",
      confidence: 0.95,
      crmInteraction: { contactName: "דני" },
    });
    const decision = await routeFabInput({ text: "דיברתי עם דני", actor, findPerson: noPerson });
    expect(decision.kind).toBe("reply");
    expect(decision.kind === "reply" && decision.reply).toContain("דני");
  });
});

describe("buildFabSystemPrompt", () => {
  it("anchors relative times to the user's clock", () => {
    const prompt = buildFabSystemPrompt({ nowLocal: "2026-09-20T11:28", todayLabel: "יום ראשון" });
    expect(prompt).toContain("2026-09-20T11:28");
    expect(prompt).toContain("יום ראשון");
  });

  it("lists the closed expense categories and tells the model distress is not a log", () => {
    const prompt = buildFabSystemPrompt();
    expect(prompt).toContain("groceries");
    expect(prompt).toContain("dining");
    expect(prompt).toContain("מצוקה");
    expect(prompt).not.toContain("PERSONAL_SPACE_SOS");
  });
});
