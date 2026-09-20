import { describe, expect, it } from "vitest";
import { classifyTaskDemand, recommendTasks, taskFit, taskUrgency } from "@/lib/intelligence/crossModule/energyTasks";
import type { Task } from "@/types";

const TODAY = "2026-09-20";

const task = (id: string, title: string, overrides: Partial<Task> = {}): Task => ({
  id,
  title,
  status: "todo",
  isHighPriority: false,
  createdAt: "2026-09-01T00:00:00Z",
  ...overrides,
});

const ids = (recs: { task: Task }[]) => recs.map((r) => r.task.id);

describe("classifyTaskDemand", () => {
  it.each([
    ["ללמוד את הסוגיה בפרק שני", "deep"],
    ["לכתוב את הסיכום השבועי", "deep"],
    ["לתכנן את הפרויקט החדש", "deep"],
    ["Write the design doc", "deep"],
    ["לקנות חלב", "light"],
    ["להתקשר לרופא", "light"],
    ["לשלם חשבון חשמל", "light"],
    ["Call the plumber", "light"],
  ])("%s → %s", (title, expected) => {
    expect(classifyTaskDemand({ title })).toBe(expected);
  });

  it("lets a keyword beat size in either direction", () => {
    // Short, but it is study.
    expect(classifyTaskDemand({ title: "ללמוד" })).toBe("deep");
    // Long, but it is an errand.
    expect(classifyTaskDemand({ title: "לקנות את כל הדברים שצריך לפני החג ולסדר אותם בבית" })).toBe("light");
  });

  it("reads a substantial task from its size when no keyword says", () => {
    expect(classifyTaskDemand({ title: "הכנה", description: "רשימה ארוכה של דברים שצריך לעבור עליהם אחד אחד" })).toBe("deep");
    expect(classifyTaskDemand({ title: "לעבור על כל הנושאים שנשארו פתוחים מהפגישה האחרונה עם הצוות" })).toBe("deep");
  });

  it("reads a small task from its size", () => {
    expect(classifyTaskDemand({ title: "לחתום על החוזה" })).toBe("light");
  });

  it("leaves the middle unclassified rather than guessing", () => {
    expect(classifyTaskDemand({ title: "הכנה לפגישה עם הצוות", description: "קצר" })).toBe("neutral");
  });
});

describe("taskUrgency", () => {
  it("ranks overdue, then high priority, then due today, then the rest", () => {
    expect(taskUrgency({ dueDate: "2026-09-10T00:00:00Z", isHighPriority: false }, TODAY)).toBe("overdue");
    expect(taskUrgency({ dueDate: "2026-09-10T00:00:00Z", isHighPriority: true }, TODAY)).toBe("overdue");
    expect(taskUrgency({ isHighPriority: true }, TODAY)).toBe("high");
    expect(taskUrgency({ dueDate: "2026-09-20T18:00:00Z", isHighPriority: false }, TODAY)).toBe("today");
    expect(taskUrgency({ dueDate: "2026-09-25T00:00:00Z", isHighPriority: false }, TODAY)).toBe("later");
    expect(taskUrgency({ isHighPriority: false }, TODAY)).toBe("later");
  });
});

describe("taskFit", () => {
  it("prefers deep work at a peak and light work when tired", () => {
    expect(taskFit("deep", "deep")).toBe("match");
    expect(taskFit("light", "deep")).toBe("mismatch");
    expect(taskFit("light", "light")).toBe("match");
    expect(taskFit("deep", "light")).toBe("mismatch");
  });

  it("has no preference at steady energy or during rest, and none about an unclassified task", () => {
    for (const demand of ["deep", "light"] as const) {
      expect(taskFit(demand, "regular")).toBe("neutral");
      expect(taskFit(demand, "rest")).toBe("neutral");
    }
    expect(taskFit("neutral", "deep")).toBe("neutral");
    expect(taskFit("neutral", "light")).toBe("neutral");
  });
});

describe("recommendTasks", () => {
  const study = task("study", "ללמוד את הסוגיה בפרק שני");
  const errand = task("errand", "לקנות חלב");
  const middling = task("mid", "הכנה לפגישה עם הצוות", { description: "קצר" });

  it("promotes deep work at a peak and quick tasks when energy is low", () => {
    expect(ids(recommendTasks([errand, study], "deep", TODAY))).toEqual(["study", "errand"]);
    expect(ids(recommendTasks([study, errand], "light", TODAY))).toEqual(["errand", "study"]);
  });

  it("keeps input order at steady energy and during rest", () => {
    for (const intensity of ["regular", "rest"] as const) {
      expect(ids(recommendTasks([errand, study], intensity, TODAY))).toEqual(["errand", "study"]);
    }
  });

  it("puts a well-fitting task ahead of an unclassified one, and a misfit behind it", () => {
    expect(ids(recommendTasks([errand, middling, study], "deep", TODAY))).toEqual(["study", "mid", "errand"]);
    expect(ids(recommendTasks([study, middling, errand], "light", TODAY))).toEqual(["errand", "mid", "study"]);
  });

  it("always leads with an overdue task, whatever the energy", () => {
    const overdueDeep = task("od-deep", "ללמוד לבחינה", { dueDate: "2026-09-10T00:00:00Z" });
    const overdueLight = task("od-light", "לשלם קנס", { dueDate: "2026-09-12T00:00:00Z" });
    for (const intensity of ["deep", "light", "regular", "rest"] as const) {
      const [first] = ids(recommendTasks([errand, study, overdueLight, overdueDeep], intensity, TODAY));
      expect(["od-deep", "od-light"], intensity).toContain(first);
    }
    // Even a poor fit leads: an overdue study task at low energy is still first.
    expect(ids(recommendTasks([errand, overdueDeep], "light", TODAY))[0]).toBe("od-deep");
  });

  it("never treats an urgent task as a misfit", () => {
    const urgentErrand = task("urgent-errand", "לחתום על החוזה", { isHighPriority: true });
    const dueTodayStudy = task("today-study", "ללמוד לבחינה", { dueDate: "2026-09-20T20:00:00Z" });
    const laterStudy = task("later-study", "לכתוב את המסמך");
    const laterErrand = task("later-errand", "לקנות חלב");

    // Peak: study matches; the urgent errand is neutral, ahead of the ordinary errand (a misfit).
    const peak = recommendTasks([laterErrand, urgentErrand, laterStudy], "deep", TODAY);
    expect(ids(peak)).toEqual(["later-study", "urgent-errand", "later-errand"]);
    expect(peak.find((r) => r.task.id === "urgent-errand")?.fit).toBe("neutral");

    // Low energy: the errand matches; the due-today study is neutral, ahead of the ordinary study (a misfit).
    const low = recommendTasks([laterStudy, dueTodayStudy, laterErrand], "light", TODAY);
    expect(ids(low)).toEqual(["later-errand", "today-study", "later-study"]);
    expect(low.find((r) => r.task.id === "today-study")?.fit).toBe("neutral");
  });

  it("labels what fits, and says when a heavy task would do better at a peak", () => {
    const peak = recommendTasks([study, errand], "deep", TODAY);
    expect(peak.find((r) => r.task.id === "study")?.label).toContain("ממוקדת");
    expect(peak.find((r) => r.task.id === "errand")?.label).toBeNull();

    const low = recommendTasks([study, errand], "light", TODAY);
    expect(low.find((r) => r.task.id === "errand")?.label).toContain("קלה");
    expect(low.find((r) => r.task.id === "study")?.label).toBe("עדיפה בשיא");
  });

  it("drops finished tasks, keeps ties stable, and does not mutate its input", () => {
    const a = task("a", "הכנה לפגישה א׳", { description: "קצר" });
    const b = task("b", "הכנה לפגישה ב׳", { description: "קצר" });
    const done = task("done", "לקנות חלב", { status: "done" });
    const input = [b, done, a];
    expect(ids(recommendTasks(input, "deep", TODAY))).toEqual(["b", "a"]);
    expect(input.map((t) => t.id)).toEqual(["b", "done", "a"]);
  });
});
