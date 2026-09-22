import { describe, expect, it, vi } from "vitest";
import { executeVoiceAction, type VoiceCompanionActions } from "@/lib/voice/voiceExecutor";
import type { VoiceRoutedAction } from "@/lib/voice/multiIntentParser";

function fakeActions(overrides: Partial<VoiceCompanionActions> = {}): { [K in keyof VoiceCompanionActions]: VoiceCompanionActions[K] & ReturnType<typeof vi.fn> } {
  return {
    addTask: vi.fn().mockResolvedValue({ id: "task-1" }),
    deleteTask: vi.fn().mockResolvedValue(undefined),
    addTransaction: vi.fn().mockResolvedValue({ id: "tx-1" }),
    deleteTransaction: vi.fn().mockResolvedValue(undefined),
    updateLearningResource: vi.fn().mockResolvedValue(undefined),
    findPerson: vi.fn().mockReturnValue(undefined),
    logPersonInteraction: vi.fn().mockResolvedValue(undefined),
    updatePerson: vi.fn().mockResolvedValue(undefined),
    addMoment: vi.fn().mockResolvedValue({ id: "moment-1" }),
    deleteMoment: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as never;
}

describe("executeVoiceAction — TASK_CREATE", () => {
  it("creates the task and undoes by its own id", async () => {
    const actions = fakeActions();
    const action: VoiceRoutedAction = {
      intent: "TASK_CREATE",
      confidence: 0.9,
      payload: { title: "לדבר עם אבא", dueAt: "2026-09-22T20:00", priority: "high", contactName: "אבא" },
    };

    const result = await executeVoiceAction(action, actions);

    expect(actions.addTask).toHaveBeenCalledWith({ title: "לדבר עם אבא", dueDate: "2026-09-22T20:00", isHighPriority: true });
    expect(result?.summary).toContain("לדבר עם אבא");

    await result?.undo();
    expect(actions.deleteTask).toHaveBeenCalledWith("task-1");
  });
});

describe("executeVoiceAction — EXPENSE_LOG", () => {
  it("logs the expense and undoes by its own id", async () => {
    const actions = fakeActions();
    const action: VoiceRoutedAction = { intent: "EXPENSE_LOG", confidence: 0.95, payload: { amount: 50, category: "transport", title: "דלק" } };

    const result = await executeVoiceAction(action, actions);

    expect(actions.addTransaction).toHaveBeenCalledWith({ amount: 50, type: "expense", title: "דלק", category: "transport" });
    await result?.undo();
    expect(actions.deleteTransaction).toHaveBeenCalledWith("tx-1");
  });
});

describe("executeVoiceAction — LEARNING_PROGRESS", () => {
  it("marks the resource complete and undoes back to incomplete", async () => {
    const actions = fakeActions();
    const action: VoiceRoutedAction = {
      intent: "LEARNING_PROGRESS",
      confidence: 0.85,
      payload: { topicId: "t1", topicTitle: "פיזיקה קוונטית", resourceId: "r1", resourceTitle: "מבוא" },
    };

    const result = await executeVoiceAction(action, actions);

    expect(actions.updateLearningResource).toHaveBeenCalledWith("r1", { isCompleted: true });
    await result?.undo();
    expect(actions.updateLearningResource).toHaveBeenLastCalledWith("r1", { isCompleted: false });
  });

  it("writes nothing, and returns null, when the topic has no incomplete resource left", async () => {
    const actions = fakeActions();
    const action: VoiceRoutedAction = {
      intent: "LEARNING_PROGRESS",
      confidence: 0.85,
      payload: { topicId: "t1", topicTitle: "פיזיקה קוונטית", resourceId: null, resourceTitle: null },
    };

    const result = await executeVoiceAction(action, actions);

    expect(result).toBeNull();
    expect(actions.updateLearningResource).not.toHaveBeenCalled();
  });
});

describe("executeVoiceAction — FAMILY_NOTE", () => {
  it("captures the person's prior note/interaction time and restores exactly that on undo — not a second interaction stamp", async () => {
    const actions = fakeActions({
      findPerson: vi.fn().mockReturnValue({ note: "ישן", lastMeaningfulInteraction: "2026-09-01T00:00:00.000Z" }),
    });
    const action: VoiceRoutedAction = { intent: "FAMILY_NOTE", confidence: 0.8, payload: { personId: "p1", personName: "אמא", noteText: "דיברנו על שבת" } };

    const result = await executeVoiceAction(action, actions);

    expect(actions.logPersonInteraction).toHaveBeenCalledWith("p1", "דיברנו על שבת");
    await result?.undo();
    expect(actions.updatePerson).toHaveBeenCalledWith("p1", { note: "ישן", lastMeaningfulInteraction: "2026-09-01T00:00:00.000Z" });
  });

  it("restores to undefined when the person had no prior note at all", async () => {
    const actions = fakeActions({ findPerson: vi.fn().mockReturnValue(undefined) });
    const action: VoiceRoutedAction = { intent: "FAMILY_NOTE", confidence: 0.8, payload: { personId: "p1", personName: "אמא", noteText: "שיחה" } };

    const result = await executeVoiceAction(action, actions);
    await result?.undo();

    expect(actions.updatePerson).toHaveBeenCalledWith("p1", { note: undefined, lastMeaningfulInteraction: undefined });
  });
});

describe("executeVoiceAction — NOTE_CAPTURE", () => {
  it("saves as a general moment and undoes by deleting it", async () => {
    const actions = fakeActions();
    const action: VoiceRoutedAction = { intent: "NOTE_CAPTURE", confidence: 0.6, payload: { title: "רעיון", content: "לבנות משהו", tags: [] } };

    const result = await executeVoiceAction(action, actions);

    expect(actions.addMoment).toHaveBeenCalledWith({ category: "general", title: "רעיון", content: "לבנות משהו" });
    await result?.undo();
    expect(actions.deleteMoment).toHaveBeenCalledWith("moment-1");
  });

  it("appends tags as hashtags rather than dropping them silently", async () => {
    const actions = fakeActions();
    const action: VoiceRoutedAction = {
      intent: "NOTE_CAPTURE",
      confidence: 0.6,
      payload: { title: "רעיון", content: "לבנות משהו", tags: ["עבודה", "דחוף"] },
    };

    await executeVoiceAction(action, actions);

    expect(actions.addMoment).toHaveBeenCalledWith({ category: "general", title: "רעיון", content: "לבנות משהו\n\n#עבודה #דחוף" });
  });
});
