import { describe, expect, it } from "vitest";
import { formatSignalsForPrompt } from "@/lib/intelligence/core/format";
import { rankSignals } from "@/lib/intelligence/core/rank";
import type { IntelligenceSignal } from "@/lib/intelligence/core/types";

function signal(patch: Partial<IntelligenceSignal>): IntelligenceSignal {
  return {
    id: "s1",
    category: "memory",
    source: "test",
    title: "t",
    summary: "תוכן האיתות",
    importance: 0.5,
    confidence: 0.8,
    recency: 1,
    ...patch,
  };
}

describe("formatSignalsForPrompt", () => {
  it("returns an empty string for no signals", () => {
    expect(formatSignalsForPrompt([])).toBe("");
  });

  it("renders each signal as a bullet with its summary", () => {
    const ranked = rankSignals([signal({ summary: "רגע ראשון" }), signal({ summary: "רגע שני" })]);
    const text = formatSignalsForPrompt(ranked);
    expect(text).toContain("- רגע ראשון");
    expect(text).toContain("- רגע שני");
  });

  it("hedges a low-confidence signal inline", () => {
    const ranked = rankSignals([signal({ summary: "השערה חלשה", confidence: 0.2 })]);
    expect(formatSignalsForPrompt(ranked)).toContain("השערה חלשה (ביטחון נמוך)");
  });

  it("does not hedge a high-confidence signal", () => {
    const ranked = rankSignals([signal({ summary: "עובדה ודאית", confidence: 0.9 })]);
    expect(formatSignalsForPrompt(ranked)).not.toContain("ביטחון נמוך");
  });

  it("respects the limit, keeping the highest-ranked signals", () => {
    const ranked = rankSignals([
      signal({ id: "a", summary: "א", importance: 0.9 }),
      signal({ id: "b", summary: "ב", importance: 0.1 }),
      signal({ id: "c", summary: "ג", importance: 0.5 }),
    ]);
    const text = formatSignalsForPrompt(ranked, 1);
    expect(text).toBe("- א");
  });
});
