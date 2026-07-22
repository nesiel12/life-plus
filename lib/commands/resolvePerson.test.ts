import { describe, expect, it } from "vitest";
import { resolvePersonByName } from "@/lib/commands/resolvePerson";

const PEOPLE = [
  { id: "1", name: "Hedva", hebrewName: "חדוה" },
  { id: "2", name: "Oded", hebrewName: "עודד" },
  { id: "3", name: "Elyasaf" },
];

describe("resolvePersonByName", () => {
  it("matches an exact Hebrew name", () => {
    expect(resolvePersonByName(PEOPLE, "עודד")?.id).toBe("2");
  });

  it("matches case-insensitively on the English name", () => {
    expect(resolvePersonByName(PEOPLE, "elyasaf")?.id).toBe("3");
  });

  it("falls back to a partial match", () => {
    expect(resolvePersonByName(PEOPLE, "חד")?.id).toBe("1");
  });

  it("returns null instead of guessing when nobody matches", () => {
    expect(resolvePersonByName(PEOPLE, "מישהו שלא קיים")).toBeNull();
  });

  it("returns null for an empty name rather than matching everything", () => {
    expect(resolvePersonByName(PEOPLE, "  ")).toBeNull();
  });
});
