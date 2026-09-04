import { describe, expect, it } from "vitest";
import { buildDecisionStream, topDecisions, type DecisionInputs } from "@/lib/lifeos/decisionStream";
import { buildSnapshot } from "@/lib/finances/analyze";
import type { Goal, Person, Task } from "@/types";

const NOW = new Date(2026, 8, 15); // 2026-09-15, local

function task(overrides: Partial<Task> & Pick<Task, "id" | "title">): Task {
  return { status: "todo", isHighPriority: false, createdAt: "2026-09-01T00:00:00Z", ...overrides };
}
function person(overrides: Partial<Person> & Pick<Person, "id" | "name">): Person {
  return { relation: "friend", ...overrides };
}
function goal(overrides: Partial<Goal> & Pick<Goal, "id" | "title">): Goal {
  return { category: "knowledge", createdAt: "2026-09-01T00:00:00Z", milestones: [], ...overrides };
}

function inputs(over: Partial<DecisionInputs> = {}): DecisionInputs {
  return { tasks: [], goals: [], people: [], snapshot: null, staleThresholdDays: 7, now: NOW, ...over };
}

describe("buildDecisionStream", () => {
  it("returns nothing when there is genuinely nothing to act on", () => {
    expect(buildDecisionStream(inputs())).toEqual([]);
  });

  it("never surfaces a completed task", () => {
    const tasks = [task({ id: "1", title: "ישן", status: "done", dueDate: "2026-09-01", isHighPriority: true })];
    expect(buildDecisionStream(inputs({ tasks }))).toEqual([]);
  });

  describe("overdue tasks", () => {
    it("surfaces a genuinely overdue task with the real number of days", () => {
      const tasks = [task({ id: "1", title: "לשלוח דוח", dueDate: "2026-09-10" })];
      const [first] = buildDecisionStream(inputs({ tasks }));
      expect(first.kind).toBe("overdue-task");
      expect(first.detail).toContain("5");
    });

    it("uses singular wording for one day", () => {
      const tasks = [task({ id: "1", title: "x", dueDate: "2026-09-14" })];
      expect(buildDecisionStream(inputs({ tasks }))[0].detail).toBe("באיחור של יום");
    });

    it("does not treat a task due today as overdue", () => {
      const tasks = [task({ id: "1", title: "x", dueDate: "2026-09-15" })];
      expect(buildDecisionStream(inputs({ tasks }))).toEqual([]);
    });

    it("does not treat a future task as overdue", () => {
      const tasks = [task({ id: "1", title: "x", dueDate: "2026-09-20" })];
      expect(buildDecisionStream(inputs({ tasks }))).toEqual([]);
    });

    it("ranks the more overdue task first", () => {
      const tasks = [
        task({ id: "a", title: "פחות", dueDate: "2026-09-14" }),
        task({ id: "b", title: "יותר", dueDate: "2026-09-01" }),
      ];
      expect(buildDecisionStream(inputs({ tasks }))[0].title).toBe("יותר");
    });
  });

  describe("ordering between categories", () => {
    it("puts an overdue task above a finance alert", () => {
      const snapshot = buildSnapshot([
        { date: "2026-09-01", amount: 100, type: "income", category: "salary" },
        { date: "2026-09-02", amount: 500, type: "expense", category: "rent" },
      ]);
      const tasks = [task({ id: "1", title: "באיחור", dueDate: "2026-09-10" })];
      const stream = buildDecisionStream(inputs({ tasks, snapshot }));
      expect(stream[0].kind).toBe("overdue-task");
      expect(stream[1].kind).toBe("finance");
    });

    it("puts a finance alert above a merely high-priority task", () => {
      const snapshot = buildSnapshot([
        { date: "2026-09-01", amount: 100, type: "income", category: "salary" },
        { date: "2026-09-02", amount: 500, type: "expense", category: "rent" },
      ]);
      const tasks = [task({ id: "1", title: "דחוף", isHighPriority: true })];
      const stream = buildDecisionStream(inputs({ tasks, snapshot }));
      expect(stream[0].kind).toBe("finance");
      expect(stream[1].kind).toBe("priority-task");
    });

    it("puts a stale contact above a stalled goal", () => {
      const people = [person({ id: "p", name: "דנה", lastMeaningfulInteraction: "2026-09-01" })];
      const goals = [goal({ id: "g", title: "יעד", milestones: [{ id: "m", title: "אבן", done: false }] })];
      const stream = buildDecisionStream(inputs({ people, goals }));
      expect(stream.map((d) => d.kind)).toEqual(["stale-contact", "stalled-goal"]);
    });
  });

  it("does not double-count an overdue task that is also high priority", () => {
    const tasks = [task({ id: "1", title: "x", dueDate: "2026-09-10", isHighPriority: true })];
    const stream = buildDecisionStream(inputs({ tasks }));
    expect(stream).toHaveLength(1);
    expect(stream[0].kind).toBe("overdue-task");
  });

  describe("stale contacts", () => {
    it("respects the user's own threshold rather than a hardcoded one", () => {
      const people = [person({ id: "p", name: "דנה", lastMeaningfulInteraction: "2026-09-10" })]; // 5 days
      expect(buildDecisionStream(inputs({ people, staleThresholdDays: 7 }))).toEqual([]);
      expect(buildDecisionStream(inputs({ people, staleThresholdDays: 3 }))).toHaveLength(1);
    });

    it("skips a contact with no recorded interaction rather than guessing", () => {
      const people = [person({ id: "p", name: "דנה" })];
      expect(buildDecisionStream(inputs({ people }))).toEqual([]);
    });

    it("prefers the Hebrew name when there is one", () => {
      const people = [person({ id: "p", name: "Dana", hebrewName: "דנה", lastMeaningfulInteraction: "2026-09-01" })];
      expect(buildDecisionStream(inputs({ people }))[0].title).toBe("דנה");
    });
  });

  describe("stalled goals", () => {
    it("surfaces a goal where no milestone is done", () => {
      const goals = [goal({ id: "g", title: "יעד", milestones: [{ id: "m", title: "אבן", done: false }] })];
      expect(buildDecisionStream(inputs({ goals }))[0].kind).toBe("stalled-goal");
    });

    it("ignores a goal with any progress", () => {
      const goals = [
        goal({
          id: "g",
          title: "יעד",
          milestones: [
            { id: "m1", title: "א", done: true },
            { id: "m2", title: "ב", done: false },
          ],
        }),
      ];
      expect(buildDecisionStream(inputs({ goals }))).toEqual([]);
    });

    it("ignores a goal with no milestones at all", () => {
      const goals = [goal({ id: "g", title: "יעד" })];
      expect(buildDecisionStream(inputs({ goals }))).toEqual([]);
    });
  });

  it("orders equal-scored items stably so the list does not reshuffle between renders", () => {
    const tasks = [
      task({ id: "b", title: "ב", isHighPriority: true }),
      task({ id: "a", title: "א", isHighPriority: true }),
    ];
    const once = buildDecisionStream(inputs({ tasks })).map((d) => d.id);
    const twice = buildDecisionStream(inputs({ tasks })).map((d) => d.id);
    expect(once).toEqual(twice);
    expect(once).toEqual(["priority-a", "priority-b"]);
  });
});

describe("topDecisions", () => {
  it("caps at three — the whole point of the stream", () => {
    const tasks = Array.from({ length: 9 }, (_, i) =>
      task({ id: `${i}`, title: `משימה ${i}`, dueDate: "2026-09-01" })
    );
    expect(topDecisions(inputs({ tasks }))).toHaveLength(3);
  });

  it("caps to the three highest-ranked, not the first three found", () => {
    const tasks = [
      task({ id: "low1", title: "רגילה 1", isHighPriority: true }),
      task({ id: "low2", title: "רגילה 2", isHighPriority: true }),
      task({ id: "low3", title: "רגילה 3", isHighPriority: true }),
      task({ id: "late", title: "באיחור", dueDate: "2026-09-01" }),
    ];
    expect(topDecisions(inputs({ tasks }))[0].title).toBe("באיחור");
  });

  it("returns fewer than three without padding when there is less to say", () => {
    const tasks = [task({ id: "1", title: "x", dueDate: "2026-09-10" })];
    expect(topDecisions(inputs({ tasks }))).toHaveLength(1);
  });
});
