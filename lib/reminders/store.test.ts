import { afterEach, describe, expect, it } from "vitest";
import { addReminder, clearFired, markFired, removeReminder, splitDue } from "./store";

// The store keeps module-level state; each test cleans up the reminders it
// made so ordering does not matter.
afterEach(() => {
  clearFired();
  const { ring, stale } = splitDue(Number.MAX_SAFE_INTEGER);
  for (const r of [...ring, ...stale]) removeReminder(r.id);
});

describe("reminders store", () => {
  it("adds a reminder and keeps the list sorted by time", () => {
    const later = addReminder({ label: "later", at: 5_000, sound: false });
    const sooner = addReminder({ label: "sooner", at: 1_000, sound: true });
    const { ring } = splitDue(10_000);
    expect(ring.map((r) => r.id)).toEqual([sooner.id, later.id]);
  });

  it("splitDue rings only due, unfired reminders and leaves the future alone", () => {
    const now = 1_000_000;
    const due = addReminder({ label: "due", at: now - 1_000, sound: true });
    addReminder({ label: "future", at: now + 60_000, sound: true });
    const { ring, stale } = splitDue(now);
    expect(ring.map((r) => r.id)).toEqual([due.id]);
    expect(stale).toHaveLength(0);
  });

  it("treats a reminder more than an hour overdue as stale, not ringing", () => {
    const now = 5_000_000;
    const missed = addReminder({ label: "missed", at: now - 2 * 60 * 60 * 1000, sound: true });
    const { ring, stale } = splitDue(now);
    expect(ring).toHaveLength(0);
    expect(stale.map((r) => r.id)).toEqual([missed.id]);
  });

  it("a fired reminder never rings again", () => {
    const now = 2_000_000;
    const r = addReminder({ label: "once", at: now - 1_000, sound: false });
    markFired(r.id);
    expect(splitDue(now).ring).toHaveLength(0);
  });

  it("falls back to a default label when given only whitespace", () => {
    const r = addReminder({ label: "   ", at: 1, sound: false });
    expect(r.label).toBe("תזכורת");
  });
});
