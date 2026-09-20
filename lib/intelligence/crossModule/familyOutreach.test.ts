import { describe, expect, it } from "vitest";
import { buildOutreachDrafts, familyCheckIns, inferRole } from "@/lib/intelligence/crossModule/familyOutreach";
import type { Person } from "@/types";

const now = new Date(2026, 8, 20, 19, 0, 0);
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();
const person = (id: string, relation: string, overrides: Partial<Person> = {}): Person => ({
  id,
  name: `איש ${id}`,
  relation,
  ...overrides,
});

describe("familyCheckIns", () => {
  it("flags someone past their relation's own threshold", () => {
    const result = familyCheckIns([person("mom", "אמא", { lastMeaningfulInteraction: daysAgo(20) })], now);
    expect(result.map((s) => s.person.id)).toEqual(["mom"]);
    expect(result[0].daysSince).toBeGreaterThanOrEqual(20);
  });

  it("stays quiet about someone spoken to recently", () => {
    expect(familyCheckIns([person("mom", "אמא", { lastMeaningfulInteraction: daysAgo(2) })], now)).toEqual([]);
  });

  it("never flags a contact with no logged interaction — there is no date to measure from", () => {
    expect(familyCheckIns([person("new", "אמא"), person("new2", "חבר")], now)).toEqual([]);
  });

  it("still surfaces an upcoming birthday for a contact with no history", () => {
    const birthday = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate() + 2).padStart(2, "0")}`;
    const result = familyCheckIns([person("bday", "חבר", { birthday })], now);
    expect(result).toHaveLength(1);
    expect(result[0].birthdayInDays).toBe(2);
  });

  it("returns the most overdue first, capped at the limit", () => {
    const people = [
      person("a", "אמא", { lastMeaningfulInteraction: daysAgo(12) }),
      person("b", "אמא", { lastMeaningfulInteraction: daysAgo(40) }),
      person("c", "אמא", { lastMeaningfulInteraction: daysAgo(25) }),
    ];
    expect(familyCheckIns(people, now).map((s) => s.person.id)).toEqual(["b", "c"]);
    expect(familyCheckIns(people, now, 3).map((s) => s.person.id)).toEqual(["b", "c", "a"]);
  });
});

describe("inferRole", () => {
  it("prefers an explicit role", () => {
    expect(inferRole({ role: "father", relation: "אמא" })).toBe("father");
  });

  it.each([
    ["אמא", "mother"],
    ["אימא", "mother"],
    ["אבא", "father"],
    ["סבא", "grandfather"],
    ["סבתא", "grandmother"],
    ["חבר קרוב", "friend"],
    ["חברה", "friend"],
    ["שכן", "other"],
    ["", "other"],
  ])("reads %j as %s", (relation, expected) => {
    expect(inferRole({ relation })).toBe(expected);
  });

  it("does not mistake a grandmother for a mother", () => {
    expect(inferRole({ relation: "סבתא" })).toBe("grandmother");
  });
});

describe("buildOutreachDrafts", () => {
  const overdueMom = (overrides: Partial<Person> = {}) =>
    person("mom", "אמא", { hebrewName: "אמא", lastMeaningfulInteraction: daysAgo(20), ...overrides });

  it("drafts a message and a pre-filled wa.me link for a contact with a phone", () => {
    const [draft] = buildOutreachDrafts([overdueMom({ phone: "052-123-4567" })], now);
    expect(draft.personId).toBe("mom");
    expect(draft.name).toBe("אמא");
    expect(draft.reason).toContain("אמא");
    expect(draft.message).toContain("אמא");
    expect(draft.href).toMatch(/^https:\/\/wa\.me\/972521234567\?text=/);
    expect(decodeURIComponent(draft.href!.split("?text=")[1])).toBe(draft.message);
  });

  it("never invents a link when there is no usable number", () => {
    for (const phone of [undefined, "", "   ", "12", "abc"]) {
      const [draft] = buildOutreachDrafts([overdueMom({ phone })], now);
      expect(draft.href, String(phone)).toBeNull();
      // The draft itself is still offered, so the message can be copied.
      expect(draft.message.length).toBeGreaterThan(0);
    }
  });

  it("uses the gendered form when the contact's gender is set, and a neutral one otherwise", () => {
    const friend = (gender?: Person["gender"]) =>
      buildOutreachDrafts([person("f", "חבר", { gender, lastMeaningfulInteraction: daysAgo(40) })], now)[0].message;
    expect(friend("male")).toContain("אתה");
    expect(friend("female")).toContain("את ");
    expect(friend(undefined)).not.toMatch(/אתה|את /);
  });

  it("lets the person's own template win outright, with {name} filled", () => {
    const [draft] = buildOutreachDrafts([overdueMom({ messageTemplate: "היי {name}, מתגעגע!" })], now);
    expect(draft.message).toBe("היי אמא, מתגעגע!");
  });

  it("wishes a happy birthday on the day, not 'how are you'", () => {
    const birthday = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const [draft] = buildOutreachDrafts([person("b", "חבר", { hebrewName: "דני", birthday })], now);
    expect(draft.message).toContain("יום הולדת שמח");
    expect(draft.message).toContain("דני");
    expect(draft.reason).toContain("יום ההולדת");
  });

  it("does not replace a custom template with the birthday line", () => {
    const birthday = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const [draft] = buildOutreachDrafts([person("b", "חבר", { birthday, messageTemplate: "הי {name}" })], now);
    expect(draft.message).toBe("הי איש b");
  });

  it("prefers the Hebrew name, falling back to the name", () => {
    const named = buildOutreachDrafts([overdueMom({ hebrewName: "אימא" })], now)[0];
    expect(named.name).toBe("אימא");
    const plain = buildOutreachDrafts([overdueMom({ hebrewName: undefined })], now)[0];
    expect(plain.name).toBe("איש mom");
  });

  it("returns nothing when nobody needs a call, and respects the limit", () => {
    expect(buildOutreachDrafts([person("ok", "אמא", { lastMeaningfulInteraction: daysAgo(1) })], now)).toEqual([]);
    const many = ["a", "b", "c"].map((id) => person(id, "אמא", { lastMeaningfulInteraction: daysAgo(30) }));
    expect(buildOutreachDrafts(many, now, 2)).toHaveLength(2);
    expect(buildOutreachDrafts(many, now, 3)).toHaveLength(3);
  });
});
