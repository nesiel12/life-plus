import { describe, expect, it, vi } from "vitest";
import {
  FabRequestError,
  QUICK_LOG_FRIENDLY_ERROR,
  executeAutoAction,
  runQuickLog,
  toProposalTurn,
  type QuickLogActions,
  type QuickLogDeps,
} from "@/lib/ai/quickLog";
import type { AutoAction, FabRouteResponse } from "@/lib/ai/fabIntents";

// Each fake keeps the real signature (so it can be passed as QuickLogActions)
// and stays a mock (so tests can assert on and re-program it).
function fakeActions(): { [K in keyof QuickLogActions]: QuickLogActions[K] & ReturnType<typeof vi.fn> } {
  return {
    addTask: vi.fn().mockResolvedValue({ id: "task-1" }),
    deleteTask: vi.fn().mockResolvedValue(undefined),
    addTransaction: vi.fn().mockResolvedValue({ id: "tx-1" }),
    deleteTransaction: vi.fn().mockResolvedValue(undefined),
    logWater: vi.fn().mockResolvedValue({ id: "water-1" }),
    deleteWater: vi.fn().mockResolvedValue(undefined),
  };
}

function deps(route: QuickLogDeps["route"], actions = fakeActions()) {
  return { deps: { route, actions } as QuickLogDeps, actions };
}

const water: AutoAction = { intent: "LOG_WATER", payload: { amountMl: 500 }, confidence: 0.95 };
const expense: AutoAction = {
  intent: "LOG_EXPENSE",
  payload: { amount: 42.5, category: "dining", title: "קפה" },
  confidence: 0.95,
};
const task: AutoAction = {
  intent: "ADD_TASK",
  payload: { title: "להתקשר לרופא", dueAt: "2026-09-21T09:00", priority: "high" },
  confidence: 0.95,
};

describe("runQuickLog — SOS", () => {
  it("never calls the network for a distress message", async () => {
    const route = vi.fn();
    const { deps: d, actions } = deps(route);

    const outcome = await runQuickLog("קשה לי עכשיו", d);

    expect(outcome).toEqual({ kind: "sos" });
    expect(route).not.toHaveBeenCalled();
    for (const action of Object.values(actions)) expect(action).not.toHaveBeenCalled();
  });

  it("honours the server's backstop when it catches what the local matcher missed", async () => {
    const { deps: d } = deps(async () => ({ mode: "sos" }));
    expect(await runQuickLog("שתיתי כוס מים", d)).toEqual({ kind: "sos" });
  });

  it("does not treat a study question as SOS", async () => {
    const route = vi.fn().mockResolvedValue({ mode: "handoff", reason: "general" });
    const { deps: d } = deps(route);
    expect(await runQuickLog("קשה לי להבין את הפרק", d)).toEqual({
      kind: "handoff",
      text: "קשה לי להבין את הפרק",
    });
    expect(route).toHaveBeenCalledOnce();
  });
});

describe("runQuickLog — auto mode", () => {
  it.each([
    ["water", water, "logWater", [500], "נרשמו 500 מ״ל מים"],
    ["expense", expense, "addTransaction", [{ amount: 42.5, type: "expense", title: "קפה", category: "dining" }], null],
    [
      "task",
      task,
      "addTask",
      [{ title: "להתקשר לרופא", dueDate: "2026-09-21T09:00", isHighPriority: true }],
      null,
    ],
  ] as const)("performs the %s write immediately", async (_name, action, method, args, summary) => {
    const { deps: d, actions } = deps(async () => ({ mode: "auto", action, summary: "x" }));

    const outcome = await runQuickLog("…", d);

    expect(actions[method]).toHaveBeenCalledWith(...args);
    expect(outcome.kind).toBe("logged");
    if (summary && outcome.kind === "logged") expect(outcome.summary).toBe(summary);
  });

  it("gives back an undo that removes exactly what was created", async () => {
    const cases: [AutoAction, keyof QuickLogActions, string][] = [
      [water, "deleteWater", "water-1"],
      [expense, "deleteTransaction", "tx-1"],
      [task, "deleteTask", "task-1"],
    ];
    for (const [action, deleter, id] of cases) {
      const actions = fakeActions();
      const log = await executeAutoAction(action, actions);
      expect(actions[deleter]).not.toHaveBeenCalled();
      await log.undo();
      expect(actions[deleter]).toHaveBeenCalledWith(id);
    }
  });

  it("removes once however many times undo is pressed", async () => {
    const actions = fakeActions();
    const log = await executeAutoAction(task, actions);
    await Promise.all([log.undo(), log.undo()]);
    await log.undo();
    expect(actions.deleteTask).toHaveBeenCalledTimes(1);
  });

  it("lets a failed undo be retried, and reports the failure", async () => {
    const actions = fakeActions();
    actions.deleteTask.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    const log = await executeAutoAction(task, actions);

    await expect(log.undo()).rejects.toThrow("offline");
    await expect(log.undo()).resolves.toBeUndefined();
    expect(actions.deleteTask).toHaveBeenCalledTimes(2);
  });

  it("reports an unsaved log rather than pretending it worked", async () => {
    const actions = fakeActions();
    actions.logWater.mockRejectedValue(new Error("500"));
    const { deps: d } = deps(async () => ({ mode: "auto", action: water, summary: "x" }), actions);
    expect(await runQuickLog("שתיתי מים", d)).toEqual({ kind: "error", message: "הרישום לא נשמר. נסה שוב." });
  });
});

describe("runQuickLog — confirm and handoff", () => {
  it("turns a Torah insight into the panel's existing add_moment proposal", async () => {
    const response: FabRouteResponse = {
      mode: "confirm",
      recommendationEventId: "rec-1",
      summary: "חידוש תורה: פשט ורמז",
      action: {
        intent: "TORAH_INSIGHT",
        payload: { title: "פשט ורמז", content: "חשבתי על ההבדל" },
        confidence: 0.9,
      },
    };
    const { deps: d, actions } = deps(async () => response);

    const outcome = await runQuickLog("חשבתי על ההבדל בין פשט לרמז", d);

    expect(outcome).toEqual({
      kind: "proposal",
      commandText: "חשבתי על ההבדל בין פשט לרמז",
      reply: "חידוש תורה: פשט ורמז — לאשר?",
      proposal: {
        type: "add_moment",
        recommendationEventId: "rec-1",
        addMoment: { category: "faith", title: "פשט ורמז", content: "חשבתי על ההבדל" },
      },
    });
    // Confirm mode proposes; it does not write.
    for (const action of Object.values(actions)) expect(action).not.toHaveBeenCalled();
  });

  it("turns a family interaction into the panel's log_family_interaction proposal", () => {
    const turn = toProposalTurn(
      {
        intent: "CRM_INTERACTION",
        payload: { personId: "p1", personName: "אמא", note: "על שבת" },
        confidence: 0.9,
      },
      "rec-2",
      "דיברתי עם אמא על שבת"
    );
    expect(turn.proposal).toEqual({
      type: "log_family_interaction",
      recommendationEventId: "rec-2",
      logFamilyInteraction: { personId: "p1", personName: "אמא", note: "על שבת" },
    });
    expect(turn.reply).toBe("לתעד שיחה עם אמא — לאשר?");
  });

  it("forwards the original text on a handoff, whatever the reason", async () => {
    for (const reason of ["general", "low_confidence", "invalid_payload", "unavailable"] as const) {
      const { deps: d } = deps(async () => ({ mode: "handoff", reason }));
      expect(await runQuickLog("  תקבע פגישה עם דני מחר ב-10 ", d)).toEqual({
        kind: "handoff",
        text: "תקבע פגישה עם דני מחר ב-10",
      });
    }
  });

  it("passes a 'contact not found' reply straight through", async () => {
    const { deps: d } = deps(async () => ({ mode: "reply", reply: 'לא מצאתי איש קשר בשם "דני"' }));
    expect(await runQuickLog("דיברתי עם דני", d)).toEqual({ kind: "reply", reply: 'לא מצאתי איש קשר בשם "דני"' });
  });
});

describe("runQuickLog — failures", () => {
  it("shows a quota explanation as-is, and hides any other failure behind the friendly line", async () => {
    const quota = deps(async () => {
      throw new FabRequestError("נגמרה המכסה היומית", true);
    });
    expect(await runQuickLog("שתיתי מים", quota.deps)).toEqual({ kind: "error", message: "נגמרה המכסה היומית" });

    const raw = deps(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await runQuickLog("שתיתי מים", raw.deps)).toEqual({ kind: "error", message: QUICK_LOG_FRIENDLY_ERROR });
  });

  it("does nothing with blank input", async () => {
    const route = vi.fn();
    const { deps: d } = deps(route);
    expect((await runQuickLog("   ", d)).kind).toBe("error");
    expect(route).not.toHaveBeenCalled();
  });
});
