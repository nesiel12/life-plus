import { describe, expect, it } from "vitest";
import {
  daysUntilBirthday,
  describeNeglect,
  findNeglected,
  thresholdDaysFor,
  type NeglectCandidate,
} from "@/lib/family/neglect";

const NOW = new Date("2026-09-15T12:00:00Z");
const DAY_MS = 86_400_000;

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString();
}

function person(overrides: Partial<NeglectCandidate> & { id: string }): NeglectCandidate {
  return {
    name: "Someone",
    relation: "friend",
    createdAt: daysAgo(365),
    ...overrides,
  };
}

describe("thresholdDaysFor", () => {
  it("uses a tighter threshold for close family", () => {
    expect(thresholdDaysFor("אמא")).toBe(10);
    expect(thresholdDaysFor("סבא")).toBe(14);
    expect(thresholdDaysFor("חבר")).toBe(30);
  });

  it("matches English relation labels too", () => {
    expect(thresholdDaysFor("grandmother")).toBe(14);
    expect(thresholdDaysFor("Father")).toBe(10);
  });

  it("falls back to the most forgiving threshold for anything unrecognised", () => {
    // An unusual label should produce silence, not a false alarm.
    expect(thresholdDaysFor("שכן מהבניין")).toBe(45);
  });
});

describe("daysUntilBirthday", () => {
  it("counts forward to this year's date", () => {
    expect(daysUntilBirthday("09-20", NOW)).toBe(5);
  });

  it("rolls to next year once the date has passed", () => {
    expect(daysUntilBirthday("09-10", NOW)).toBe(360);
  });

  it("returns 0 on the day itself", () => {
    expect(daysUntilBirthday("09-15", NOW)).toBe(0);
  });

  it("rejects malformed values", () => {
    expect(daysUntilBirthday("", NOW)).toBeNull();
    expect(daysUntilBirthday("13-01", NOW)).toBeNull();
    expect(daysUntilBirthday("9-1", NOW)).toBeNull();
  });
});

describe("findNeglected", () => {
  it("says nothing about someone contacted recently", () => {
    const people = [person({ id: "1", relation: "אמא", lastMeaningfulInteraction: daysAgo(3) })];
    expect(findNeglected(people, NOW)).toEqual([]);
  });

  it("flags someone past their relation's threshold", () => {
    const people = [person({ id: "1", relation: "אמא", lastMeaningfulInteraction: daysAgo(20) })];
    const signals = findNeglected(people, NOW);
    expect(signals).toHaveLength(1);
    expect(signals[0].daysSince).toBe(20);
    expect(signals[0].thresholdDays).toBe(10);
  });

  it("applies the threshold per relation, not globally", () => {
    // 20 days is overdue for a parent and perfectly normal for a friend.
    const people = [
      person({ id: "parent", relation: "אבא", lastMeaningfulInteraction: daysAgo(20) }),
      person({ id: "friend", relation: "חבר", lastMeaningfulInteraction: daysAgo(20) }),
    ];
    expect(findNeglected(people, NOW).map((s) => s.person.id)).toEqual(["parent"]);
  });

  it("measures a never-contacted person from when they were added", () => {
    // Otherwise importing a contact list produces a wall of accusations on
    // day one.
    const justAdded = person({ id: "1", relation: "אמא", createdAt: daysAgo(2) });
    expect(findNeglected([justAdded], NOW)).toEqual([]);

    const addedLongAgo = person({ id: "2", relation: "אמא", createdAt: daysAgo(90) });
    expect(findNeglected([addedLongAgo], NOW)).toHaveLength(1);
  });

  it("surfaces an imminent birthday even when contact is recent", () => {
    const people = [
      person({
        id: "1",
        relation: "חבר",
        lastMeaningfulInteraction: daysAgo(1),
        birthday: "09-18",
      }),
    ];
    const signals = findNeglected(people, NOW);
    expect(signals).toHaveLength(1);
    expect(signals[0].birthdayInDays).toBe(3);
  });

  it("ignores a birthday that is still far off", () => {
    const people = [
      person({ id: "1", relation: "חבר", lastMeaningfulInteraction: daysAgo(1), birthday: "12-01" }),
    ];
    expect(findNeglected(people, NOW)).toEqual([]);
  });

  it("ranks an imminent birthday above someone merely overdue", () => {
    const people = [
      person({ id: "overdue", relation: "אמא", lastMeaningfulInteraction: daysAgo(200) }),
      person({
        id: "birthday",
        relation: "חבר",
        lastMeaningfulInteraction: daysAgo(1),
        birthday: "09-16",
      }),
    ];
    expect(findNeglected(people, NOW)[0].person.id).toBe("birthday");
  });

  it("ranks by how far past the threshold, not raw days", () => {
    // 40 days for a friend (threshold 30) is less overdue in proportion than
    // 25 days for a parent (threshold 10).
    const people = [
      person({ id: "friend", relation: "חבר", lastMeaningfulInteraction: daysAgo(40) }),
      person({ id: "parent", relation: "אמא", lastMeaningfulInteraction: daysAgo(25) }),
    ];
    expect(findNeglected(people, NOW).map((s) => s.person.id)).toEqual(["parent", "friend"]);
  });

  it("caps how many it returns", () => {
    const people = Array.from({ length: 10 }, (_, i) =>
      person({ id: String(i), relation: "אמא", lastMeaningfulInteraction: daysAgo(100 + i) })
    );
    expect(findNeglected(people, NOW)).toHaveLength(3);
    expect(findNeglected(people, NOW, { limit: 1 })).toHaveLength(1);
  });

  it("skips a contact with an unparseable timestamp instead of crashing", () => {
    const people = [person({ id: "1", relation: "אמא", lastMeaningfulInteraction: "not a date" })];
    expect(findNeglected(people, NOW)).toEqual([]);
  });
});

describe("describeNeglect", () => {
  it("leads with the birthday when there is one", () => {
    const [signal] = findNeglected(
      [person({ id: "1", name: "Dana", hebrewName: "דנה", relation: "חבר", birthday: "09-15", lastMeaningfulInteraction: daysAgo(1) })],
      NOW
    );
    expect(describeNeglect(signal)).toBe("היום יום ההולדת של דנה");
  });

  it("scales the unit to the gap", () => {
    const weeks = findNeglected(
      [person({ id: "1", hebrewName: "עודד", relation: "אמא", lastMeaningfulInteraction: daysAgo(21) })],
      NOW
    )[0];
    expect(describeNeglect(weeks)).toContain("שבועות");

    const months = findNeglected(
      [person({ id: "2", hebrewName: "עודד", relation: "אמא", lastMeaningfulInteraction: daysAgo(95) })],
      NOW
    )[0];
    expect(describeNeglect(months)).toContain("חודשים");
  });

  it("prefers the Hebrew name when there is one", () => {
    const [signal] = findNeglected(
      [person({ id: "1", name: "Oded", hebrewName: "עודד", relation: "אמא", lastMeaningfulInteraction: daysAgo(30) })],
      NOW
    );
    expect(describeNeglect(signal)).toContain("עודד");
  });
});
