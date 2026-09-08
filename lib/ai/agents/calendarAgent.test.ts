import { describe, expect, it } from "vitest";
import {
  formatCalendarReply,
  parseLocalDateTime,
  summarizeBusyForPrompt,
  type ResolveCalendarIntentResult,
} from "@/lib/ai/agents/calendarAgent";

describe("parseLocalDateTime", () => {
  it("parses a valid wall-clock string as local time, not UTC", () => {
    const date = parseLocalDateTime("2026-09-15T14:30");
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2026);
    expect(date!.getMonth()).toBe(8); // 0-indexed
    expect(date!.getDate()).toBe(15);
    expect(date!.getHours()).toBe(14);
    expect(date!.getMinutes()).toBe(30);
  });

  it("rejects a malformed string rather than guessing", () => {
    expect(parseLocalDateTime("not a date")).toBeNull();
    expect(parseLocalDateTime("2026-09-15")).toBeNull();
    expect(parseLocalDateTime("2026-13-40T14:30")).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(parseLocalDateTime("  2026-09-15T14:30  ")).not.toBeNull();
  });

  it("tolerates the shapes a model emits despite the prompt", () => {
    // seconds, a space separator, a trailing Z / offset — all read as the
    // same local wall time.
    for (const v of [
      "2026-09-15T14:30:00",
      "2026-09-15 14:30",
      "2026-09-15T14:30:00Z",
      "2026-09-15T14:30:00.000+03:00",
    ]) {
      const d = parseLocalDateTime(v);
      expect(d, v).not.toBeNull();
      expect(d!.getHours(), v).toBe(14);
      expect(d!.getMinutes(), v).toBe(30);
    }
  });
});

describe("summarizeBusyForPrompt", () => {
  it("renders a real interval with its title", () => {
    const summary = summarizeBusyForPrompt([
      { start: "2026-09-15T09:00:00+03:00", end: "2026-09-15T10:00:00+03:00", title: "פגישת צוות" },
    ]);
    expect(summary).toContain("פגישת צוות");
    expect(summary).toContain("09:00");
    expect(summary).toContain("10:00");
  });

  it("omits an untitled event's colon rather than rendering an empty title", () => {
    const summary = summarizeBusyForPrompt([{ start: "2026-09-15T09:00:00+03:00", end: "2026-09-15T10:00:00+03:00" }]);
    expect(summary).not.toContain(": ");
  });

  it("drops an interval it can't parse instead of throwing", () => {
    const summary = summarizeBusyForPrompt([
      { start: "not a date", end: "also not a date" },
      { start: "2026-09-15T09:00:00+03:00", end: "2026-09-15T10:00:00+03:00", title: "אמיתי" },
    ]);
    expect(summary).toContain("אמיתי");
    expect(summary.split("\n")).toHaveLength(1);
  });

  it("returns an empty string for no events, letting the caller supply the '(אין אירועים)' fallback", () => {
    expect(summarizeBusyForPrompt([])).toBe("");
  });

  it("caps at 60 lines", () => {
    const many = Array.from({ length: 90 }, (_, i) => ({
      start: `2026-09-${String((i % 28) + 1).padStart(2, "0")}T09:00:00+03:00`,
      end: `2026-09-${String((i % 28) + 1).padStart(2, "0")}T10:00:00+03:00`,
      title: `אירוע ${i}`,
    }));
    expect(summarizeBusyForPrompt(many).split("\n")).toHaveLength(60);
  });
});

describe("formatCalendarReply", () => {
  it("passes an unclear result's clarification straight through", () => {
    const result: ResolveCalendarIntentResult = { status: "unclear", clarification: "באיזה יום?" };
    expect(formatCalendarReply(result)).toBe("באיזה יום?");
  });

  it("states the real title and time for a clean proposal, with no conflict language", () => {
    const result: ResolveCalendarIntentResult = {
      status: "proposed",
      event: {
        title: "פגישה עם דנה",
        start: "2026-09-15T14:00:00",
        end: "2026-09-15T15:00:00",
        durationMinutes: 60,
      },
      conflict: false,
      alternatives: [],
    };
    const reply = formatCalendarReply(result);
    expect(reply).toContain("פגישה עם דנה");
    expect(reply).toContain("14:00");
    expect(reply).toContain("15:00");
    expect(reply).not.toContain("התנגשות");
    expect(reply).not.toContain("קבוע באותו זמן");
  });

  it("never claims the event was actually created", () => {
    const result: ResolveCalendarIntentResult = {
      status: "proposed",
      event: { title: "X", start: "2026-09-15T14:00:00", end: "2026-09-15T15:00:00", durationMinutes: 60 },
      conflict: false,
      alternatives: [],
    };
    const reply = formatCalendarReply(result);
    expect(reply).not.toMatch(/נוסף|נקבע|קבעתי/);
    expect(reply).toContain("ליומן החכם");
  });

  it("surfaces a real conflict and lists real alternatives", () => {
    const result: ResolveCalendarIntentResult = {
      status: "proposed",
      event: { title: "פגישה", start: "2026-09-15T14:00:00", end: "2026-09-15T15:00:00", durationMinutes: 60 },
      conflict: true,
      alternatives: [
        { start: "2026-09-15T16:00:00", end: "2026-09-15T17:00:00", durationMinutes: 60, energy: "peak", score: 1060 },
      ],
    };
    const reply = formatCalendarReply(result);
    expect(reply).toContain("קבוע באותו זמן");
    expect(reply).toContain("16:00");
    expect(reply).toContain("17:00");
  });

  it("still names the conflict honestly when there is nothing else to offer", () => {
    const result: ResolveCalendarIntentResult = {
      status: "proposed",
      event: { title: "פגישה", start: "2026-09-15T14:00:00", end: "2026-09-15T15:00:00", durationMinutes: 60 },
      conflict: true,
      alternatives: [],
    };
    const reply = formatCalendarReply(result);
    expect(reply).toContain("קבוע באותו זמן");
    expect(reply).not.toContain("חלופיים");
  });
});
