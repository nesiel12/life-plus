import { describe, expect, it } from "vitest";
import { pickSuggestedAction } from "@/lib/family/pickSuggestedAction";

describe("pickSuggestedAction", () => {
  it("prioritizes an upcoming birthday over everything else", () => {
    const action = pickSuggestedAction({ health: "healthy", daysUntilBirthday: 3, hasRelatedMemory: true });
    expect(action.type).toBe("congratulate");
  });

  it("still suggests congratulating on the birthday itself (0 days)", () => {
    const action = pickSuggestedAction({ health: "healthy", daysUntilBirthday: 0, hasRelatedMemory: false });
    expect(action.type).toBe("congratulate");
    expect(action.rationale).toContain("היום");
  });

  it("does not treat a birthday far in the future as imminent", () => {
    const action = pickSuggestedAction({ health: "healthy", daysUntilBirthday: 60, hasRelatedMemory: false });
    expect(action.type).not.toBe("congratulate");
  });

  it("suggests calling when the relationship needs attention", () => {
    const action = pickSuggestedAction({ health: "needs_attention", daysUntilBirthday: null, hasRelatedMemory: false });
    expect(action.type).toBe("call");
  });

  it("suggests a message when the relationship is merely growing", () => {
    const action = pickSuggestedAction({ health: "growing", daysUntilBirthday: null, hasRelatedMemory: false });
    expect(action.type).toBe("message");
  });

  it("suggests meeting up for a healthy relationship with real shared history", () => {
    const action = pickSuggestedAction({ health: "healthy", daysUntilBirthday: null, hasRelatedMemory: true });
    expect(action.type).toBe("meet");
  });

  it("falls back to a plain, honest message when nothing else applies", () => {
    const action = pickSuggestedAction({ health: "healthy", daysUntilBirthday: null, hasRelatedMemory: false });
    expect(action.type).toBe("message");
  });
});
