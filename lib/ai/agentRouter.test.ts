import { describe, expect, it } from "vitest";
import { buildSnapshot } from "@/lib/finances/analyze";
import { formatTaskAssistGrounding, groundFinance, groundStudy, groundTasks, matchTaskByTitle } from "@/lib/ai/agentRouter";
import type { TaskAssist } from "@/lib/ai/agents/taskAgent";
import type { LearningResource, LearningTopic, Task } from "@/types";

function task(overrides: Partial<Task> & Pick<Task, "id" | "title">): Task {
  return {
    status: "todo",
    isHighPriority: false,
    createdAt: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

describe("groundFinance", () => {
  it("says plainly when there is no snapshot, rather than an empty answer", () => {
    const grounding = groundFinance(null);
    expect(grounding.lines.some((l) => l.includes("עדיין לא נרשמו תנועות"))).toBe(true);
    expect(grounding.basedOn).toEqual(["תמונת מצב פיננסית — אין נתונים"]);
  });

  it("cites the real month, not a vague attribution", () => {
    const snapshot = buildSnapshot([
      { date: "2026-02-05", amount: 1000, type: "income", category: "salary" },
      { date: "2026-02-06", amount: 200, type: "expense", category: "groceries" },
    ])!;
    const grounding = groundFinance(snapshot);
    expect(grounding.basedOn).toEqual(["תמונת מצב פיננסית — 2026-02"]);
    expect(grounding.lines.some((l) => l.includes("2026-02"))).toBe(true);
  });
});

describe("groundTasks", () => {
  const now = new Date(2026, 8, 15); // 2026-09-15

  it("says plainly when there are no open tasks, rather than an empty list", () => {
    const grounding = groundTasks([task({ id: "1", title: "ישן", status: "done" })], now);
    expect(grounding!.lines.some((l) => l.includes("אין כרגע אף משימה פתוחה"))).toBe(true);
  });

  it("counts open tasks correctly, excluding done ones", () => {
    const tasks = [
      task({ id: "1", title: "א" }),
      task({ id: "2", title: "ב" }),
      task({ id: "3", title: "ג", status: "done" }),
    ];
    const grounding = groundTasks(tasks, now)!;
    expect(grounding.lines).toContain('סה"כ משימות פתוחות: 2.');
    expect(grounding.basedOn).toEqual(["רשימת המשימות — 2 פתוחות"]);
  });

  it("identifies genuinely overdue tasks by real date comparison, not a guess", () => {
    const tasks = [
      task({ id: "1", title: "באיחור", dueDate: "2026-09-10" }),
      task({ id: "2", title: "היום", dueDate: "2026-09-15" }), // not overdue — due today
      task({ id: "3", title: "עתידי", dueDate: "2026-09-20" }),
      task({ id: "4", title: "בלי תאריך" }),
    ];
    const grounding = groundTasks(tasks, now)!;
    const overdueLine = grounding.lines.find((l) => l.startsWith("- באיחור"));
    expect(overdueLine).toBeDefined();
    expect(grounding.lines.some((l) => l.startsWith("- היום"))).toBe(false);
    expect(grounding.lines.some((l) => l.startsWith("- עתידי"))).toBe(false);
  });

  it("says plainly when nothing is overdue", () => {
    const grounding = groundTasks([task({ id: "1", title: "עתידי", dueDate: "2026-09-20" })], now)!;
    expect(grounding.lines).toContain("אין משימות שעבר מועד היעד שלהן.");
  });

  it("lists real high-priority tasks by title", () => {
    const tasks = [
      task({ id: "1", title: "דחוף", isHighPriority: true }),
      task({ id: "2", title: "רגיל" }),
    ];
    const grounding = groundTasks(tasks, now)!;
    expect(grounding.lines.some((l) => l.includes("עדיפות גבוהה (1)"))).toBe(true);
    expect(grounding.lines).toContain("- דחוף");
    expect(grounding.lines.some((l) => l === "- רגיל")).toBe(false);
  });

  it("caps the listed overdue/high-priority tasks and says how many more there are", () => {
    const tasks = Array.from({ length: 8 }, (_, i) =>
      task({ id: `${i}`, title: `דחוף ${i}`, isHighPriority: true })
    );
    const grounding = groundTasks(tasks, now)!;
    const listed = grounding.lines.filter((l) => l.startsWith("- דחוף")).length;
    expect(listed).toBe(5);
    expect(grounding.lines.some((l) => l.includes("ועוד 3 נוספות"))).toBe(true);
  });
});

describe("matchTaskByTitle", () => {
  const tasks = [
    task({ id: "1", title: "לכתוב מייל לרופא" }),
    task({ id: "2", title: "לקנות חלב" }),
    task({ id: "3", title: "הושלם כבר", status: "done" }),
  ];

  it("matches when the message contains the task's exact title", () => {
    const match = matchTaskByTitle(tasks, "תעזור לי עם המשימה לכתוב מייל לרופא בבקשה");
    expect(match?.id).toBe("1");
  });

  it("matches the other direction too — a short message naming a longer title's gist", () => {
    const match = matchTaskByTitle(tasks, "לקנות חלב");
    expect(match?.id).toBe("2");
  });

  it("never matches a done task", () => {
    expect(matchTaskByTitle(tasks, "הושלם כבר")).toBeNull();
  });

  it("returns null when nothing real matches, rather than a wrong guess", () => {
    expect(matchTaskByTitle(tasks, "לתכנן חופשה בחו״ל")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(matchTaskByTitle(tasks, "   ")).toBeNull();
  });
});

describe("groundStudy", () => {
  function topic(overrides: Partial<LearningTopic> & Pick<LearningTopic, "id" | "title">): LearningTopic {
    return { status: "active", createdAt: "2026-09-01T00:00:00Z", ...overrides };
  }
  function resource(overrides: Partial<LearningResource> & Pick<LearningResource, "id" | "topicId">): LearningResource {
    return {
      type: "youtube",
      title: "r",
      isCompleted: false,
      createdAt: "2026-09-01T00:00:00Z",
      ...overrides,
    };
  }

  it("says plainly when there are no topics", () => {
    const grounding = groundStudy([], []);
    expect(grounding!.lines.some((l) => l.includes("לא הוסיף אף נושא"))).toBe(true);
    expect(grounding!.basedOn).toEqual(["מרחב הלמידה — ריק"]);
  });

  it("states real per-topic completion counts, not a vague summary", () => {
    const topics = [topic({ id: "t1", title: "פייתון" })];
    const resources = [
      resource({ id: "r1", topicId: "t1", isCompleted: true }),
      resource({ id: "r2", topicId: "t1", isCompleted: false }),
      resource({ id: "r3", topicId: "t1", isCompleted: true }),
    ];
    const grounding = groundStudy(topics, resources)!;
    expect(grounding.lines.some((l) => l.includes("פייתון") && l.includes("2/3 מקורות הושלמו"))).toBe(true);
  });

  it("names a topic with no resources honestly rather than 0/0", () => {
    const grounding = groundStudy([topic({ id: "t1", title: "ריק" })], [])!;
    expect(grounding.lines.some((l) => l.includes("ריק") && l.includes("בלי מקורות עדיין"))).toBe(true);
  });

  it("only counts a topic's own resources, not another topic's", () => {
    const topics = [topic({ id: "t1", title: "א" }), topic({ id: "t2", title: "ב" })];
    const resources = [resource({ id: "r1", topicId: "t2", isCompleted: true })];
    const grounding = groundStudy(topics, resources)!;
    expect(grounding.lines.some((l) => l.includes("א") && l.includes("בלי מקורות עדיין"))).toBe(true);
    expect(grounding.lines.some((l) => l.includes("ב") && l.includes("1/1 מקורות הושלמו"))).toBe(true);
  });
});

describe("formatTaskAssistGrounding", () => {
  it("names the real matched task, not a generic reference", () => {
    const assist: TaskAssist = { kind: "unclear", unclearReason: "זו פעולה פיזית." };
    const grounding = formatTaskAssistGrounding("לקפל כביסה", assist);
    expect(grounding.lines[0]).toContain("לקפל כביסה");
    expect(grounding.basedOn).toEqual(["עוזר הביצוע — לקפל כביסה"]);
  });

  it("includes the real research overview and considerations", () => {
    const assist: TaskAssist = {
      kind: "research",
      overview: "בחירת מחשב נייד תלויה בשימוש המיועד.",
      considerations: ["ביצועים מול ניידות", "תקציב"],
    };
    const grounding = formatTaskAssistGrounding("לתחקר מחשב נייד", assist);
    expect(grounding.lines).toContain("בחירת מחשב נייד תלויה בשימוש המיועד.");
    expect(grounding.lines).toContain("- ביצועים מול ניידות");
    expect(grounding.lines).toContain("- תקציב");
  });

  it("includes the real draft subject and body", () => {
    const assist: TaskAssist = {
      kind: "draft",
      draftSubject: "בקשה לתור",
      draftBody: "שלום, אשמח לתאם תור בהקדם.",
    };
    const grounding = formatTaskAssistGrounding("לכתוב מייל לרופא", assist);
    expect(grounding.lines).toContain("נושא: בקשה לתור");
    expect(grounding.lines).toContain("שלום, אשמח לתאם תור בהקדם.");
  });

  it("includes the honest unclear reason without inventing help", () => {
    const assist: TaskAssist = { kind: "unclear", unclearReason: "זו פעולה פיזית שלא ניתן לעזור בה מרחוק." };
    const grounding = formatTaskAssistGrounding("לקפל כביסה", assist);
    expect(grounding.lines).toContain("זו פעולה פיזית שלא ניתן לעזור בה מרחוק.");
  });

  it("degrades gracefully when a mode's own fields are missing", () => {
    const grounding = formatTaskAssistGrounding("X", { kind: "research" });
    expect(grounding.lines).toEqual(['המשתמש ביקש עזרה עם המשימה הפתוחה שלו "X".']);
  });
});
