import { describe, expect, it } from "vitest";
import { buildClarifiedMessage } from "@/lib/calendar/clarification";

describe("buildClarifiedMessage", () => {
  it("returns the original untouched when nothing was clarified", () => {
    expect(buildClarifiedMessage("קבע פגישה מחר", [])).toBe("קבע פגישה מחר");
  });

  it("carries the original request, so a bare answer isn't stranded without context", () => {
    const message = buildClarifiedMessage("קבע פגישה", [{ question: "באיזה יום ובאיזו שעה?", answer: "מחר ב-3" }]);
    expect(message).toContain("קבע פגישה");
    expect(message).toContain("באיזה יום ובאיזו שעה?");
    expect(message).toContain("מחר ב-3");
  });

  it("replays multiple rounds in order", () => {
    const message = buildClarifiedMessage("קבע פגישה", [
      { question: "באיזה יום?", answer: "מחר" },
      { question: "באיזו שעה?", answer: "15:00" },
    ]);
    expect(message.indexOf("מחר")).toBeLessThan(message.indexOf("15:00"));
    expect(message.indexOf("באיזה יום?")).toBeLessThan(message.indexOf("באיזו שעה?"));
  });

  it("tells the agent not to re-ask what was already answered", () => {
    const message = buildClarifiedMessage("קבע פגישה", [{ question: "מתי?", answer: "מחר ב-3" }]);
    expect(message).toContain("אל תשאל שוב");
  });
});
