import { describe, expect, it } from "vitest";
import { estimateDaysRemaining } from "@/lib/goals/estimateCompletion";

describe("estimateDaysRemaining", () => {
  it("returns null when there is no confident pace pattern", () => {
    expect(estimateDaysRemaining(3, null)).toBeNull();
  });

  it("returns null when there is nothing left to complete", () => {
    expect(estimateDaysRemaining(0, 4)).toBeNull();
  });

  it("multiplies remaining milestones by the average pace, rounded", () => {
    expect(estimateDaysRemaining(3, 4.4)).toBe(13);
  });
});
