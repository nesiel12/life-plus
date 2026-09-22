import { describe, expect, it } from "vitest";
import { isDuplicateSubmission } from "@/lib/voice/submissionDedup";

const WINDOW_MS = 4000;

describe("isDuplicateSubmission", () => {
  it("allows a first submission with nothing in flight and no prior history", () => {
    expect(isDuplicateSubmission({ text: "וואלה בסדר", isSubmitting: false, lastSubmission: null, now: 1000, windowMs: WINDOW_MS })).toBe(false);
  });

  it("rejects any submission while one is already being processed, regardless of text", () => {
    expect(
      isDuplicateSubmission({
        text: "משהו אחר לגמרי",
        isSubmitting: true,
        lastSubmission: { text: "וואלה בסדר", at: 1000 },
        now: 1500,
        windowMs: WINDOW_MS,
      })
    ).toBe(true);
  });

  it("rejects the exact same text submitted again just after the first — the actual double-submission bug", () => {
    expect(
      isDuplicateSubmission({
        text: "וואלה בסדר",
        isSubmitting: false,
        lastSubmission: { text: "וואלה בסדר", at: 1000 },
        now: 1050,
        windowMs: WINDOW_MS,
      })
    ).toBe(true);
  });

  it("allows different text even immediately after the last submission", () => {
    expect(
      isDuplicateSubmission({ text: "משהו חדש", isSubmitting: false, lastSubmission: { text: "וואלה בסדר", at: 1000 }, now: 1050, windowMs: WINDOW_MS })
    ).toBe(false);
  });

  it("allows the same text again once the duplicate window has passed — a legitimate repeat, not a race", () => {
    expect(
      isDuplicateSubmission({
        text: "כן",
        isSubmitting: false,
        lastSubmission: { text: "כן", at: 1000 },
        now: 1000 + WINDOW_MS,
        windowMs: WINDOW_MS,
      })
    ).toBe(false);
  });

  it("treats the window as exclusive at the boundary", () => {
    expect(
      isDuplicateSubmission({
        text: "כן",
        isSubmitting: false,
        lastSubmission: { text: "כן", at: 1000 },
        now: 1000 + WINDOW_MS - 1,
        windowMs: WINDOW_MS,
      })
    ).toBe(true);
  });
});
