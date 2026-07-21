import { describe, expect, it } from "vitest";
import {
  getFeedbackWeight,
  isValidStatusTransition,
  calculateFeedbackConfidenceAdjustment,
  summarizeRecommendationOutcomes,
} from "@/lib/intelligence/recommendations/feedback";
import type { RecommendationStatus } from "@/lib/intelligence/recommendations/types";

describe("getFeedbackWeight", () => {
  it("weights accepted positively and rejected negatively", () => {
    expect(getFeedbackWeight("accepted")).toBe(1);
    expect(getFeedbackWeight("rejected")).toBe(-1);
  });

  it("treats modified as a soft positive, not a rejection", () => {
    const weight = getFeedbackWeight("modified");
    expect(weight).toBeGreaterThan(0);
    expect(weight).toBeLessThan(1);
  });

  it("treats expired (ignored) as only a weak negative, never as strong as an explicit rejection", () => {
    const expired = getFeedbackWeight("expired");
    const rejected = getFeedbackWeight("rejected");
    expect(expired).toBeLessThan(0);
    expect(Math.abs(expired)).toBeLessThan(Math.abs(rejected));
  });

  it("gives pending no signal either way", () => {
    expect(getFeedbackWeight("pending")).toBe(0);
  });
});

describe("isValidStatusTransition", () => {
  it("allows pending to move to any terminal status", () => {
    const terminals: RecommendationStatus[] = ["accepted", "rejected", "modified", "expired"];
    for (const status of terminals) {
      expect(isValidStatusTransition("pending", status)).toBe(true);
    }
  });

  it("does not allow a terminal status to transition further", () => {
    const terminals: RecommendationStatus[] = ["accepted", "rejected", "modified", "expired"];
    for (const from of terminals) {
      for (const to of ["pending", "accepted", "rejected", "modified", "expired"] as RecommendationStatus[]) {
        expect(isValidStatusTransition(from, to)).toBe(false);
      }
    }
  });

  it("does not allow pending to transition to itself", () => {
    expect(isValidStatusTransition("pending", "pending")).toBe(false);
  });
});

describe("calculateFeedbackConfidenceAdjustment", () => {
  it("returns 0 for no events", () => {
    expect(calculateFeedbackConfidenceAdjustment([])).toBe(0);
  });

  it("averages weights across events", () => {
    const result = calculateFeedbackConfidenceAdjustment([
      { status: "accepted" },
      { status: "accepted" },
      { status: "rejected" },
    ]);
    expect(result).toBeCloseTo((1 + 1 - 1) / 3);
  });

  it("returns a strongly positive signal for consistent acceptance", () => {
    const events = Array.from({ length: 5 }, () => ({ status: "accepted" as const }));
    expect(calculateFeedbackConfidenceAdjustment(events)).toBe(1);
  });

  it("returns a strongly negative signal for consistent rejection", () => {
    const events = Array.from({ length: 5 }, () => ({ status: "rejected" as const }));
    expect(calculateFeedbackConfidenceAdjustment(events)).toBe(-1);
  });
});

describe("summarizeRecommendationOutcomes", () => {
  it("omits a type with fewer than the minimum number of responses", () => {
    const events = [
      { type: "calendar_suggestion", status: "accepted" as const },
      { type: "calendar_suggestion", status: "rejected" as const },
    ];
    expect(summarizeRecommendationOutcomes(events)).toEqual([]);
  });

  it("summarizes a type once it has enough responses", () => {
    const events = [
      { type: "calendar_suggestion", status: "accepted" as const },
      { type: "calendar_suggestion", status: "accepted" as const },
      { type: "calendar_suggestion", status: "rejected" as const },
    ];
    const result = summarizeRecommendationOutcomes(events);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: "calendar_suggestion",
      totalCount: 3,
      acceptedCount: 2,
      rejectedCount: 1,
    });
  });

  it("summarizes multiple types independently", () => {
    const events = [
      ...Array.from({ length: 3 }, () => ({ type: "calendar_suggestion", status: "accepted" as const })),
      ...Array.from({ length: 3 }, () => ({ type: "goal_milestones", status: "rejected" as const })),
    ];
    const result = summarizeRecommendationOutcomes(events);
    expect(result.map((s) => s.type).sort()).toEqual(["calendar_suggestion", "goal_milestones"]);
  });
});
