import { describe, expect, it } from "vitest";
import { joinContextSections } from "@/lib/context/formatContext";

describe("joinContextSections", () => {
  it("drops empty sections and joins the rest with a blank line", () => {
    const result = joinContextSections(["", "A:\n- a", "", "B:\n- b"]);
    expect(result).toBe("A:\n- a\n\nB:\n- b");
  });

  it("returns an empty string when every section is empty", () => {
    expect(joinContextSections(["", ""])).toBe("");
  });
});
