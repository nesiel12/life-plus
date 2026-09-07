import { describe, expect, it } from "vitest";
import { isReminderDue } from "@/lib/proactive/jobs/reminderSweep";

const START = "2026-03-10T09:00:00Z";

function at(iso: string) {
  return new Date(iso);
}

describe("isReminderDue", () => {
  it("is not due before the reminder window opens", () => {
    // 15-minute reminder on a 09:00 event opens at 08:45.
    expect(isReminderDue({ start_time: START, reminder_minutes: 15 }, at("2026-03-10T08:44:00Z"))).toBe(
      false
    );
  });

  it("is due the moment the window opens", () => {
    expect(isReminderDue({ start_time: START, reminder_minutes: 15 }, at("2026-03-10T08:45:00Z"))).toBe(
      true
    );
  });

  it("stays due through the window", () => {
    expect(isReminderDue({ start_time: START, reminder_minutes: 15 }, at("2026-03-10T08:55:00Z"))).toBe(
      true
    );
  });

  it("stops being due once the event has started", () => {
    // "Your event starts in 15 minutes" about something already underway is
    // worse than saying nothing — a late sweep must drop it, not send it.
    expect(isReminderDue({ start_time: START, reminder_minutes: 15 }, at("2026-03-10T09:00:00Z"))).toBe(
      false
    );
    expect(isReminderDue({ start_time: START, reminder_minutes: 15 }, at("2026-03-10T09:30:00Z"))).toBe(
      false
    );
  });

  it("is never due when no reminder was set", () => {
    expect(isReminderDue({ start_time: START, reminder_minutes: null }, at("2026-03-10T08:50:00Z"))).toBe(
      false
    );
  });

  it("handles a zero-minute reminder as 'at the start', which is never inside the window", () => {
    // fireAt === start, and the window is [fireAt, start) — deliberately
    // empty. A reminder set for the exact start time has nothing to warn about.
    expect(isReminderDue({ start_time: START, reminder_minutes: 0 }, at("2026-03-10T09:00:00Z"))).toBe(
      false
    );
  });

  it("handles a long lead time", () => {
    // A day-ahead reminder opens 24h before.
    expect(
      isReminderDue({ start_time: START, reminder_minutes: 1440 }, at("2026-03-09T09:30:00Z"))
    ).toBe(true);
    expect(
      isReminderDue({ start_time: START, reminder_minutes: 1440 }, at("2026-03-09T08:30:00Z"))
    ).toBe(false);
  });

  it("is not due for an unparseable start time", () => {
    expect(isReminderDue({ start_time: "not a date", reminder_minutes: 15 }, at(START))).toBe(false);
  });
});
