import { describe, expect, it } from "vitest";
import { textDirection } from "@/lib/textDirection";

describe("textDirection", () => {
  it("detects Hebrew as rtl", () => {
    expect(textDirection("בוקר טוב")).toBe("rtl");
    expect(textDirection("שלום, דוד")).toBe("rtl");
  });
  it("detects English as ltr", () => {
    expect(textDirection("Good night")).toBe("ltr");
    expect(textDirection("Good night, David")).toBe("ltr");
  });
  it("uses the first strong character, ignoring leading punctuation/digits", () => {
    expect(textDirection("  123 — Good morning")).toBe("ltr");
    expect(textDirection("!!! בוקר")).toBe("rtl");
  });
  it("falls back to rtl for direction-neutral text", () => {
    expect(textDirection("123 456")).toBe("rtl");
  });
});
