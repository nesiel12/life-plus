import { describe, expect, it } from "vitest";
import { describeVoiceAction, normalizeDueAt, validateVoiceItem, type VoiceModelItem, type VoiceRoutedAction } from "@/lib/voice/multiIntentParser";

function item(partial: Partial<VoiceModelItem> & Pick<VoiceModelItem, "intent" | "confidence">): VoiceModelItem {
  return partial as VoiceModelItem;
}

describe("normalizeDueAt", () => {
  it("passes a clean date-time through unchanged", () => {
    expect(normalizeDueAt("2026-09-22T20:00")).toBe("2026-09-22T20:00");
  });

  it("passes a bare date through unchanged", () => {
    expect(normalizeDueAt("2026-09-22")).toBe("2026-09-22");
  });

  it("strips seconds and a trailing zone rather than losing the due time", () => {
    expect(normalizeDueAt("2026-09-22T20:00:00.000Z")).toBe("2026-09-22T20:00");
    expect(normalizeDueAt("2026-09-22T20:00:00+03:00")).toBe("2026-09-22T20:00");
  });

  it("drops what it cannot parse instead of guessing", () => {
    expect(normalizeDueAt("מחר בערב")).toBeUndefined();
  });

  it("passes undefined through", () => {
    expect(normalizeDueAt(undefined)).toBeUndefined();
  });
});

describe("validateVoiceItem — TASK_CREATE", () => {
  it("normalizes a full task, defaulting priority to normal", () => {
    const result = validateVoiceItem(
      item({
        intent: "TASK_CREATE",
        confidence: 0.9,
        taskCreate: { title: "לדבר עם אבא", dueAt: "2026-09-22T20:00:00Z", contactName: "אבא" },
      })
    );
    expect(result).toEqual({
      intent: "TASK_CREATE",
      confidence: 0.9,
      payload: { title: "לדבר עם אבא", dueAt: "2026-09-22T20:00", priority: "normal", contactName: "אבא" },
    });
  });

  it("keeps an explicit high priority", () => {
    const result = validateVoiceItem(item({ intent: "TASK_CREATE", confidence: 0.9, taskCreate: { title: "דחוף!", priority: "high" } }));
    expect(result?.payload).toMatchObject({ priority: "high" });
  });

  it("rejects a TASK_CREATE the model chose but never filled in", () => {
    expect(validateVoiceItem(item({ intent: "TASK_CREATE", confidence: 0.9 }))).toBeNull();
  });

  it("rejects below the confidence floor", () => {
    const result = validateVoiceItem(item({ intent: "TASK_CREATE", confidence: 0.5, taskCreate: { title: "אולי" } }));
    expect(result).toBeNull();
  });
});

describe("validateVoiceItem — EXPENSE_LOG", () => {
  it("rounds the amount to cents and renames description to title", () => {
    const result = validateVoiceItem(
      item({ intent: "EXPENSE_LOG", confidence: 0.95, expenseLog: { amount: 50.999, category: "transport", description: "דלק" } })
    );
    expect(result).toEqual({ intent: "EXPENSE_LOG", confidence: 0.95, payload: { amount: 51, category: "transport", title: "דלק" } });
  });

  it("needs a higher floor than the other intents — a misheard amount corrupts trusted numbers", () => {
    const result = validateVoiceItem(
      item({ intent: "EXPENSE_LOG", confidence: 0.7, expenseLog: { amount: 50, category: "other", description: "משהו" } })
    );
    expect(result).toBeNull();
  });
});

describe("validateVoiceItem — LEARNING_PROGRESS / FAMILY_NOTE", () => {
  it("passes the raw topic query through unresolved — the route resolves it against real topics", () => {
    const result = validateVoiceItem(
      item({ intent: "LEARNING_PROGRESS", confidence: 0.8, learningProgress: { topicQuery: "פיזיקה" } })
    );
    expect(result).toEqual({ intent: "LEARNING_PROGRESS", confidence: 0.8, payload: { topicQuery: "פיזיקה" } });
  });

  it("passes the raw contact name through unresolved, dropping actionRequired (not a stored field)", () => {
    const result = validateVoiceItem(
      item({ intent: "FAMILY_NOTE", confidence: 0.8, familyNote: { contactName: "אמא", noteText: "דיברנו על שבת", actionRequired: true } })
    );
    expect(result).toEqual({ intent: "FAMILY_NOTE", confidence: 0.8, payload: { contactName: "אמא", noteText: "דיברנו על שבת" } });
  });
});

describe("validateVoiceItem — NOTE_CAPTURE", () => {
  it("defaults tags to an empty array", () => {
    const result = validateVoiceItem(item({ intent: "NOTE_CAPTURE", confidence: 0.6, noteCapture: { title: "רעיון", content: "לבנות משהו" } }));
    expect(result?.payload).toMatchObject({ tags: [] });
  });
});

describe("a single stream-of-consciousness utterance decomposes into several validated items", () => {
  // "למדתי היום פרק על פיזיקה, הוצאתי 50 שקל על דלק, ותזכיר לי לדבר עם אבא בערב"
  it("keeps all three intents, each shaped for its own module", () => {
    const modelItems: VoiceModelItem[] = [
      item({ intent: "LEARNING_PROGRESS", confidence: 0.85, learningProgress: { topicQuery: "פיזיקה" } }),
      item({ intent: "EXPENSE_LOG", confidence: 0.95, expenseLog: { amount: 50, category: "transport", description: "דלק" } }),
      item({
        intent: "TASK_CREATE",
        confidence: 0.9,
        taskCreate: { title: "לדבר עם אבא", dueAt: "2026-09-22T20:00", contactName: "אבא" },
      }),
    ];

    const validated = modelItems.map(validateVoiceItem);
    expect(validated.every((v) => v !== null)).toBe(true);
    expect(validated.map((v) => v?.intent)).toEqual(["LEARNING_PROGRESS", "EXPENSE_LOG", "TASK_CREATE"]);
  });

  it("drops a low-confidence fragment while keeping the confident ones", () => {
    const modelItems: VoiceModelItem[] = [
      item({ intent: "NOTE_CAPTURE", confidence: 0.3, noteCapture: { title: "משהו מעורפל", content: "..." } }),
      item({ intent: "EXPENSE_LOG", confidence: 0.95, expenseLog: { amount: 12, category: "dining", description: "קפה" } }),
    ];
    const validated = modelItems.map(validateVoiceItem);
    expect(validated).toEqual([null, expect.objectContaining({ intent: "EXPENSE_LOG" })]);
  });
});

describe("describeVoiceAction", () => {
  it("summarizes a task with a due time and a linked contact", () => {
    const action: VoiceRoutedAction = {
      intent: "TASK_CREATE",
      confidence: 0.9,
      payload: { title: "לדבר עם אבא", dueAt: "2026-09-22T20:00", priority: "high", contactName: "אבא" },
    };
    expect(describeVoiceAction(action)).toBe("משימה: לדבר עם אבא · 2026-09-22 20:00 · עם אבא · דחוף");
  });

  it("summarizes an expense with its Hebrew category label", () => {
    const action: VoiceRoutedAction = { intent: "EXPENSE_LOG", confidence: 0.95, payload: { amount: 50, category: "transport", title: "דלק" } };
    expect(describeVoiceAction(action)).toBe("הוצאה: דלק · 50 ₪ · תחבורה ודלק");
  });

  it("summarizes resolved learning progress, and the all-done case separately", () => {
    const withResource: VoiceRoutedAction = {
      intent: "LEARNING_PROGRESS",
      confidence: 0.85,
      payload: { topicId: "t1", topicTitle: "פיזיקה קוונטית", resourceId: "r1", resourceTitle: "מבוא" },
    };
    expect(describeVoiceAction(withResource)).toBe('למידה: פיזיקה קוונטית — הושלם "מבוא"');

    const allDone: VoiceRoutedAction = {
      intent: "LEARNING_PROGRESS",
      confidence: 0.85,
      payload: { topicId: "t1", topicTitle: "פיזיקה קוונטית", resourceId: null, resourceTitle: null },
    };
    expect(describeVoiceAction(allDone)).toBe("למידה: פיזיקה קוונטית — כל המשאבים כבר הושלמו");
  });

  it("summarizes a resolved family note and a note capture", () => {
    const familyNote: VoiceRoutedAction = { intent: "FAMILY_NOTE", confidence: 0.8, payload: { personId: "p1", personName: "אמא", noteText: "על שבת" } };
    expect(describeVoiceAction(familyNote)).toBe("תיעוד שיחה עם אמא");

    const note: VoiceRoutedAction = { intent: "NOTE_CAPTURE", confidence: 0.6, payload: { title: "רעיון", content: "...", tags: [] } };
    expect(describeVoiceAction(note)).toBe("פתק: רעיון");
  });
});
