import { describe, expect, it } from "vitest";
import {
  briefingReason,
  deterministicBriefing,
  formatBriefingInput,
  selectBriefingParts,
  type BriefingInput,
} from "@/lib/proactive/jobs/morningBriefing.format";

const TZ = "Asia/Jerusalem";

function input(overrides: Partial<BriefingInput> = {}): BriefingInput {
  return {
    today: "2026-03-10",
    timeZone: TZ,
    events: [],
    tasks: [],
    ...overrides,
  };
}

describe("selectBriefingParts", () => {
  it("keeps only events that fall on the user's local today", () => {
    const parts = selectBriefingParts(
      input({
        events: [
          // 23:30Z on the 9th is 01:30 on the 10th in Jerusalem — today.
          { title: "Late", start: "2026-03-09T23:30:00Z", isAllDay: false },
          { title: "Today", start: "2026-03-10T07:00:00Z", isAllDay: false },
          // 22:30Z on the 10th is 00:30 on the 11th — tomorrow.
          { title: "Tomorrow", start: "2026-03-10T22:30:00Z", isAllDay: false },
        ],
      })
    );

    expect(parts.timedEvents.map((e) => e.title)).toEqual(["Late", "Today"]);
  });

  it("orders timed events chronologically", () => {
    const parts = selectBriefingParts(
      input({
        events: [
          { title: "Afternoon", start: "2026-03-10T14:00:00Z", isAllDay: false },
          { title: "Morning", start: "2026-03-10T06:00:00Z", isAllDay: false },
        ],
      })
    );
    expect(parts.timedEvents.map((e) => e.title)).toEqual(["Morning", "Afternoon"]);
  });

  it("separates all-day events, matching them on their bare date", () => {
    const parts = selectBriefingParts(
      input({
        events: [
          { title: "יום הולדת", start: "2026-03-10", isAllDay: true },
          { title: "Other day", start: "2026-03-11", isAllDay: true },
        ],
      })
    );
    expect(parts.allDayEvents.map((e) => e.title)).toEqual(["יום הולדת"]);
  });

  it("surfaces high-priority tasks and tasks due today, capped at three", () => {
    const parts = selectBriefingParts(
      input({
        tasks: [
          { title: "P1", isHighPriority: true },
          { title: "P2", isHighPriority: true },
          { title: "Due", dueDate: "2026-03-10T09:00:00Z", isHighPriority: false },
          { title: "P3", isHighPriority: true },
          { title: "Someday", isHighPriority: false },
        ],
      })
    );

    expect(parts.focusTasks).toHaveLength(3);
    // A task with neither a flag nor a due date is not 07:00 material.
    expect(parts.focusTasks.map((t) => t.title)).not.toContain("Someday");
  });

  it("does not list a task twice when it is both high-priority and due today", () => {
    const task = { title: "Both", dueDate: "2026-03-10T09:00:00Z", isHighPriority: true };
    const parts = selectBriefingParts(input({ tasks: [task] }));
    expect(parts.focusTasks).toEqual([task]);
  });

  it("flags a genuinely empty day", () => {
    expect(selectBriefingParts(input()).isEmptyDay).toBe(true);
  });

  it("does not call a day empty when there is a relationship nudge", () => {
    const parts = selectBriefingParts(input({ relationshipNudge: "לא דיברת עם סבא 3 שבועות" }));
    expect(parts.isEmptyDay).toBe(false);
  });
});

describe("deterministicBriefing", () => {
  it("says the day is free rather than listing nothing", () => {
    const data = input();
    const text = deterministicBriefing(selectBriefingParts(data), data);
    expect(text).toContain("בוקר טוב");
    expect(text).toContain("פנוי");
  });

  it("greets by name when one is known", () => {
    const data = input({ greetingName: "נשיאל" });
    expect(deterministicBriefing(selectBriefingParts(data), data)).toContain("בוקר טוב, נשיאל");
  });

  it("names events with their local times", () => {
    const data = input({
      events: [{ title: "פגישה", start: "2026-03-10T07:00:00Z", isAllDay: false }],
    });
    const text = deterministicBriefing(selectBriefingParts(data), data);
    // 07:00Z is 09:00 in Jerusalem — the user's clock, not the server's.
    expect(text).toContain("09:00");
    expect(text).toContain("פגישה");
  });

  it("asks for an intention when none is set, and states it when one is", () => {
    const without = input();
    expect(deterministicBriefing(selectBriefingParts(without), without)).toContain("מה הכוונה שלך");

    const withIntention = input({ intention: "לסיים את הפרק" });
    const text = deterministicBriefing(selectBriefingParts(withIntention), withIntention);
    expect(text).toContain("לסיים את הפרק");
  });

  it("summarises rather than listing a long day in full", () => {
    const data = input({
      events: Array.from({ length: 7 }, (_, i) => ({
        title: `אירוע ${i}`,
        start: `2026-03-10T0${i}:00:00Z`,
        isAllDay: false,
      })),
    });
    const text = deterministicBriefing(selectBriefingParts(data), data);
    expect(text).toContain("ועוד 3");
  });
});

describe("formatBriefingInput", () => {
  it("gives the model structured facts, never prose to paraphrase", () => {
    const data = input({
      events: [{ title: "פגישה", start: "2026-03-10T07:00:00Z", isAllDay: false }],
      tasks: [{ title: "משימה", isHighPriority: true }],
      intention: "",
    });
    const text = formatBriefingInput(selectBriefingParts(data), data);

    expect(text).toContain("ביומן היום:");
    expect(text).toContain("09:00 פגישה");
    expect(text).toContain("משימה (עדיפות גבוהה)");
    expect(text).toContain("עדיין לא הוגדרה כוונה");
  });

  it("states plainly when the calendar is empty, so the model cannot invent events", () => {
    const data = input();
    expect(formatBriefingInput(selectBriefingParts(data), data)).toContain(
      "ביומן היום: אין אירועים מתוזמנים."
    );
  });
});

describe("briefingReason", () => {
  it("names only the sources that actually contributed", () => {
    const parts = selectBriefingParts(input({ tasks: [{ title: "x", isHighPriority: true }] }));
    const reason = briefingReason(parts, false);
    // The calendar was not connected, so claiming it as a source would be a lie.
    expect(reason).not.toContain("היומן");
    expect(reason).toContain("המשימות");
  });

  it("falls back to an honest generic line when nothing contributed", () => {
    expect(briefingReason(selectBriefingParts(input()), false)).toContain("על סמך");
  });
});
