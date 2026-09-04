import { describe, expect, it } from "vitest";
import { buildMessage, forGender, normalizePhone, whatsappLink, ROLE_LABELS } from "@/lib/family/whatsapp";

describe("forGender", () => {
  const phrase = { male: "אתה", female: "את", neutral: "שלומך" };

  it("picks the matching form", () => {
    expect(forGender(phrase, "male")).toBe("אתה");
    expect(forGender(phrase, "female")).toBe("את");
  });

  // The point of the neutral form: an unset gender must never be a coin flip.
  it("uses neutral phrasing when gender is unset, rather than guessing", () => {
    expect(forGender(phrase, undefined)).toBe("שלומך");
  });
});

describe("buildMessage", () => {
  it("conjugates a friend message by gender", () => {
    const male = buildMessage({ role: "friend", gender: "male", name: "יוסי" });
    const female = buildMessage({ role: "friend", gender: "female", name: "דנה" });
    expect(male).toContain("אתה");
    expect(female).toContain("את ");
    expect(male).not.toBe(female);
  });

  it("falls back to neutral phrasing with no gender set", () => {
    const neutral = buildMessage({ role: "friend", name: "דנה" });
    expect(neutral).toContain("מה שלומך");
    expect(neutral).not.toContain("אתה");
  });

  it("has a distinct template per role", () => {
    const roles = ["mother", "father", "grandfather", "grandmother", "friend", "other"] as const;
    const messages = roles.map((role) => buildMessage({ role, name: "x" }));
    expect(new Set(messages).size).toBe(roles.length);
  });

  it("addresses parents and grandparents by title", () => {
    expect(buildMessage({ role: "mother", name: "x" })).toContain("אמא");
    expect(buildMessage({ role: "father", name: "x" })).toContain("אבא");
    expect(buildMessage({ role: "grandfather", name: "x" })).toContain("סבא");
    expect(buildMessage({ role: "grandmother", name: "x" })).toContain("סבתא");
  });

  describe("custom templates", () => {
    it("uses the user's own wording verbatim rather than 'improving' it", () => {
      const message = buildMessage({ role: "friend", gender: "male", name: "יוסי", customTemplate: "יו מה קורה" });
      expect(message).toBe("יו מה קורה");
    });

    it("substitutes {name}", () => {
      const message = buildMessage({ role: "friend", name: "דנה", customTemplate: "היי {name}, מה שלומך?" });
      expect(message).toBe("היי דנה, מה שלומך?");
    });

    it("substitutes every occurrence of {name}", () => {
      const message = buildMessage({ role: "friend", name: "דנה", customTemplate: "{name}, {name}!" });
      expect(message).toBe("דנה, דנה!");
    });

    it("ignores a blank custom template and uses the role default", () => {
      const message = buildMessage({ role: "mother", name: "x", customTemplate: "   " });
      expect(message).toContain("אמא");
    });
  });

  it("has a Hebrew label for every role", () => {
    expect(ROLE_LABELS.mother).toBe("אמא");
    expect(Object.values(ROLE_LABELS).every((l) => l.length > 0)).toBe(true);
  });
});

describe("normalizePhone", () => {
  it("expands an Israeli local number to international form", () => {
    expect(normalizePhone("052-123-4567")).toBe("972521234567");
  });

  it("strips spaces, dashes and parentheses", () => {
    expect(normalizePhone("(052) 123 4567")).toBe("972521234567");
  });

  it("keeps an international number, dropping the plus wa.me rejects", () => {
    expect(normalizePhone("+972521234567")).toBe("972521234567");
  });

  it("accepts a number already in international form without a plus", () => {
    expect(normalizePhone("972521234567")).toBe("972521234567");
  });

  it("honours a different default country code", () => {
    expect(normalizePhone("07911123456", "44")).toBe("447911123456");
  });

  // A malformed wa.me link opens a confusing WhatsApp error page, so
  // refusing is better than emitting one.
  it("returns null for input with no usable digits", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone("לא מספר")).toBeNull();
  });

  it("returns null for a number too short to be real", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("0123")).toBeNull();
  });
});

describe("whatsappLink", () => {
  it("builds a pre-filled wa.me link", () => {
    const link = whatsappLink("052-123-4567", "שלום");
    expect(link).toBe(`https://wa.me/972521234567?text=${encodeURIComponent("שלום")}`);
  });

  // The reason it's encodeURIComponent and not encodeURI: each of these
  // would otherwise truncate the message in the recipient's compose box.
  it("encodes characters that would truncate the message", () => {
    const link = whatsappLink("0521234567", "מה קורה? אני & אתה #יאללה")!;
    expect(link).toContain("%3F"); // ?
    expect(link).toContain("%26"); // &
    expect(link).toContain("%23"); // #
    expect(link.split("?text=")[1]).not.toContain("&");
  });

  it("encodes Hebrew and newlines", () => {
    const link = whatsappLink("0521234567", "שורה\nשנייה")!;
    expect(link).toContain("%0A");
    expect(link).not.toContain("\n");
  });

  it("returns null when there is no usable phone number", () => {
    expect(whatsappLink(undefined, "שלום")).toBeNull();
    expect(whatsappLink("", "שלום")).toBeNull();
  });

  it("round-trips to the original message", () => {
    const message = "היי דנה, מה שלומך? נדבר?";
    const link = whatsappLink("0521234567", message)!;
    const encoded = link.split("?text=")[1];
    expect(decodeURIComponent(encoded)).toBe(message);
  });
});
