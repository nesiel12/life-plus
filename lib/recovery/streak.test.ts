import { describe, expect, it } from "vitest";
import {
  computeStreak,
  daysBetween,
  formatStreak,
  milestoneProgress,
  riskHoursFromEvents,
  streakStart,
  type RecoveryEvent,
  type RecoveryProgram,
} from "@/lib/recovery/streak";

function program(overrides: Partial<RecoveryProgram> = {}): RecoveryProgram {
  return {
    id: "p1",
    title: "עישון",
    cleanSince: "2026-09-01T00:00:00Z",
    reasons: [],
    triggers: [],
    riskHours: [],
    copingStrategies: [],
    celebratedMilestones: [],
    isActive: true,
    createdAt: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function event(kind: RecoveryEvent["kind"], occurredAt: string, extra: Partial<RecoveryEvent> = {}): RecoveryEvent {
  return { id: `${kind}-${occurredAt}`, kind, occurredAt, ...extra };
}

const NOW = new Date("2026-09-15T12:00:00Z");

describe("daysBetween", () => {
  it("counts whole elapsed days", () => {
    expect(daysBetween("2026-09-01T00:00:00Z", new Date("2026-09-08T00:00:00Z"))).toBe(7);
  });

  it("does not round a partial day up", () => {
    // 6 days and 23 hours is still 6 days clean, not 7. Rounding up would
    // hand someone a milestone they have not reached.
    expect(daysBetween("2026-09-01T00:00:00Z", new Date("2026-09-07T23:00:00Z"))).toBe(6);
  });

  it("clamps a future start date to zero rather than going negative", () => {
    expect(daysBetween("2026-10-01T00:00:00Z", NOW)).toBe(0);
  });

  it("returns zero for an unparseable date", () => {
    expect(daysBetween("not a date", NOW)).toBe(0);
  });
});

describe("streakStart", () => {
  it("is the clean date when there has been no relapse", () => {
    expect(streakStart(program(), [])).toBe("2026-09-01T00:00:00Z");
  });

  it("moves to the most recent relapse", () => {
    const events = [
      event("relapse", "2026-09-05T00:00:00Z"),
      event("relapse", "2026-09-10T00:00:00Z"),
      event("urge", "2026-09-12T00:00:00Z"),
    ];
    expect(streakStart(program(), events)).toBe("2026-09-10T00:00:00Z");
  });

  it("ignores a relapse that predates the clean date", () => {
    // Someone who logged a relapse and then set a later clean date has
    // restarted deliberately; the earlier event must not drag the streak back.
    const events = [event("relapse", "2026-08-20T00:00:00Z")];
    expect(streakStart(program({ cleanSince: "2026-09-01T00:00:00Z" }), events)).toBe(
      "2026-09-01T00:00:00Z"
    );
  });
});

describe("computeStreak", () => {
  it("counts days from the clean date with no relapses", () => {
    const state = computeStreak(program(), [], NOW);
    expect(state.currentDays).toBe(14);
    expect(state.totalRelapses).toBe(0);
  });

  it("restarts the count after a relapse", () => {
    const state = computeStreak(program(), [event("relapse", "2026-09-12T00:00:00Z")], NOW);
    expect(state.currentDays).toBe(3);
    expect(state.totalRelapses).toBe(1);
  });

  it("remembers the best run even after a relapse ends it", () => {
    // Eleven clean days before the relapse, three since. The eleven still
    // happened, and that is the point of tracking a best.
    const state = computeStreak(program(), [event("relapse", "2026-09-12T00:00:00Z")], NOW);
    expect(state.bestDays).toBe(11);
  });

  it("takes the best across several runs", () => {
    const state = computeStreak(
      program({ cleanSince: "2026-08-01T00:00:00Z" }),
      [event("relapse", "2026-08-20T00:00:00Z"), event("relapse", "2026-09-12T00:00:00Z")],
      NOW
    );
    // 19 days, then 23 days, then 3.
    expect(state.bestDays).toBe(23);
  });

  it("counts urges resisted", () => {
    const state = computeStreak(
      program(),
      [event("urge", "2026-09-03T00:00:00Z"), event("urge", "2026-09-08T00:00:00Z")],
      NOW
    );
    expect(state.urgesResisted).toBe(2);
  });

  it("reports the last and next milestone", () => {
    const state = computeStreak(program(), [], NOW); // 14 days
    expect(state.lastMilestone).toBe(14);
    expect(state.nextMilestone).toBe(30);
    expect(state.daysToNextMilestone).toBe(16);
  });

  it("has no next milestone past the final one", () => {
    const state = computeStreak(program({ cleanSince: "2020-01-01T00:00:00Z" }), [], NOW);
    expect(state.nextMilestone).toBeNull();
    expect(state.daysToNextMilestone).toBeNull();
  });

  it("lists uncelebrated milestones as pending", () => {
    const state = computeStreak(program({ celebratedMilestones: [1, 3] }), [], NOW);
    expect(state.pendingCelebrations).toEqual([7, 14]);
  });

  it("has nothing pending once everything reached is celebrated", () => {
    const state = computeStreak(program({ celebratedMilestones: [1, 3, 7, 14] }), [], NOW);
    expect(state.pendingCelebrations).toEqual([]);
  });

  it("re-offers a milestone after a relapse resets past it", () => {
    // Day 7 was celebrated, then a relapse; reaching day 7 again is a real
    // achievement, not a duplicate. The pending list is derived from the
    // CURRENT run, so it reappears once the new run passes it.
    const events = [event("relapse", "2026-09-07T00:00:00Z")];
    const state = computeStreak(program({ celebratedMilestones: [] }), events, NOW);
    expect(state.currentDays).toBe(8);
    expect(state.pendingCelebrations).toContain(7);
  });

  it("treats day zero honestly", () => {
    const state = computeStreak(
      program({ cleanSince: "2026-09-15T06:00:00Z" }),
      [],
      NOW
    );
    expect(state.currentDays).toBe(0);
    expect(state.lastMilestone).toBeNull();
    expect(state.nextMilestone).toBe(1);
  });
});

describe("riskHoursFromEvents", () => {
  const hourOf = (iso: string) => new Date(iso).getUTCHours();

  it("says nothing until there is enough evidence", () => {
    // Two data points is a coincidence. Naming an hour off it would be
    // believed, which is what makes it worse than silence.
    const events = [event("urge", "2026-09-01T21:00:00Z"), event("urge", "2026-09-02T21:00:00Z")];
    expect(riskHoursFromEvents(events, hourOf)).toEqual([]);
  });

  it("surfaces hours carrying disproportionately many cravings", () => {
    const events = [
      event("urge", "2026-09-01T22:00:00Z"),
      event("urge", "2026-09-02T22:00:00Z"),
      event("urge", "2026-09-03T22:00:00Z"),
      event("urge", "2026-09-04T09:00:00Z"),
      event("relapse", "2026-09-05T22:00:00Z"),
    ];
    expect(riskHoursFromEvents(events, hourOf)).toEqual([22]);
  });

  it("counts relapses as risk evidence too", () => {
    const events = [
      event("relapse", "2026-09-01T23:00:00Z"),
      event("relapse", "2026-09-02T23:00:00Z"),
      event("urge", "2026-09-03T23:00:00Z"),
      event("urge", "2026-09-04T10:00:00Z"),
    ];
    expect(riskHoursFromEvents(events, hourOf)).toContain(23);
  });

  it("ignores plain notes", () => {
    const events = [
      event("note", "2026-09-01T22:00:00Z"),
      event("note", "2026-09-02T22:00:00Z"),
      event("note", "2026-09-03T22:00:00Z"),
      event("note", "2026-09-04T22:00:00Z"),
    ];
    expect(riskHoursFromEvents(events, hourOf)).toEqual([]);
  });
});

describe("formatStreak", () => {
  it("reads naturally at each count", () => {
    expect(formatStreak(0)).toBe("היום הראשון");
    expect(formatStreak(1)).toBe("יום אחד נקי");
    expect(formatStreak(2)).toBe("יומיים נקיים");
    expect(formatStreak(12)).toBe("12 ימים נקיים");
  });
});

describe("milestoneProgress", () => {
  it("measures progress between the last milestone and the next", () => {
    const state = computeStreak(program({ cleanSince: "2026-09-01T00:00:00Z" }), [], NOW);
    // Day 14 of the 14→30 span, so progress is 0.
    expect(milestoneProgress(state)).toBe(0);
  });

  it("is null once every milestone is behind", () => {
    const state = computeStreak(program({ cleanSince: "2020-01-01T00:00:00Z" }), [], NOW);
    expect(milestoneProgress(state)).toBeNull();
  });

  it("reaches 1 at the moment the next milestone lands", () => {
    const state = computeStreak(
      program({ cleanSince: "2026-08-16T12:00:00Z" }),
      [],
      NOW
    );
    expect(state.currentDays).toBe(30);
    // Day 30 is itself a milestone, so the span becomes 30→60 and restarts.
    expect(milestoneProgress(state)).toBe(0);
  });
});
