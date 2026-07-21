import { describe, expect, it } from "vitest";
import { pickNextReview } from "@/lib/learning/pickNextReview";

describe("pickNextReview", () => {
  it("returns null for no entries", () => {
    expect(pickNextReview([])).toBeNull();
  });

  it("picks the only entry when there's just one", () => {
    const entry = { id: "a", date: "2026-07-01" };
    expect(pickNextReview([entry])).toBe(entry);
  });

  it("prefers an entry never reviewed over one reviewed recently", () => {
    const neverReviewed = { id: "a", date: "2026-07-01" };
    const reviewedRecently = { id: "b", date: "2026-06-01", lastReviewedAt: "2026-07-19" };
    expect(pickNextReview([reviewedRecently, neverReviewed])).toBe(neverReviewed);
  });

  it("picks whichever entry was reviewed longest ago when both have been reviewed", () => {
    const reviewedLongAgo = { id: "a", date: "2026-06-01", lastReviewedAt: "2026-06-15" };
    const reviewedRecently = { id: "b", date: "2026-06-01", lastReviewedAt: "2026-07-18" };
    expect(pickNextReview([reviewedRecently, reviewedLongAgo])).toBe(reviewedLongAgo);
  });

  it("falls back to an entry's own date when it has never been reviewed", () => {
    const olderUnreviewed = { id: "a", date: "2026-05-01" };
    const newerUnreviewed = { id: "b", date: "2026-07-01" };
    expect(pickNextReview([newerUnreviewed, olderUnreviewed])).toBe(olderUnreviewed);
  });
});
