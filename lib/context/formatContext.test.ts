import { describe, expect, it } from "vitest";
import { formatContextSection, joinContextSections } from "@/lib/context/formatContext";

describe("formatContextSection", () => {
  it("returns an empty string for an empty list", () => {
    expect(formatContextSection("Title", [])).toBe("");
  });

  it("renders a titled bullet list", () => {
    expect(formatContextSection("Goals", ["Learn X", "Do Y"])).toBe("Goals:\n- Learn X\n- Do Y");
  });
});

describe("joinContextSections", () => {
  it("drops empty sections and joins the rest with a blank line", () => {
    const result = joinContextSections(["", "A:\n- a", "", "B:\n- b"]);
    expect(result).toBe("A:\n- a\n\nB:\n- b");
  });

  it("returns an empty string when every section is empty", () => {
    expect(joinContextSections(["", ""])).toBe("");
  });
});
