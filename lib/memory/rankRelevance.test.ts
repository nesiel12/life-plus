import { describe, expect, it } from "vitest";
import { rankByRelevance, type MemoryCandidate } from "@/lib/memory/rankRelevance";

const NOW = new Date("2026-07-20T12:00:00Z").getTime();

function candidate(patch: Partial<MemoryCandidate>): MemoryCandidate {
  return {
    id: "1",
    text: "",
    timestamp: "2026-07-20T00:00:00Z",
    label: "",
    ...patch,
  };
}

describe("rankByRelevance", () => {
  it("returns nothing when the query has no usable tokens", () => {
    expect(rankByRelevance("", [candidate({ text: "hello" })], 5, NOW)).toEqual([]);
    expect(rankByRelevance("a", [candidate({ text: "hello" })], 5, NOW)).toEqual([]);
  });

  it("excludes candidates with zero keyword overlap", () => {
    const result = rankByRelevance(
      "sleep schedule",
      [candidate({ id: "x", text: "completely unrelated topic" })],
      5,
      NOW
    );
    expect(result).toEqual([]);
  });

  it("ranks a candidate with keyword overlap above one without", () => {
    const result = rankByRelevance(
      "learning Gemara",
      [
        candidate({ id: "match", text: "started learning a new Gemara today" }),
        candidate({ id: "nomatch", text: "went for a walk" }),
      ],
      5,
      NOW
    );
    expect(result.map((r) => r.id)).toEqual(["match"]);
  });

  it("prefers more recent items when keyword overlap is equal", () => {
    const result = rankByRelevance(
      "focus",
      [
        candidate({ id: "old", text: "focus session", timestamp: "2026-01-01T00:00:00Z" }),
        candidate({ id: "recent", text: "focus session", timestamp: "2026-07-19T00:00:00Z" }),
      ],
      5,
      NOW
    );
    expect(result.map((r) => r.id)).toEqual(["recent", "old"]);
  });

  it("respects the limit", () => {
    const candidates = Array.from({ length: 10 }, (_, i) =>
      candidate({ id: String(i), text: "focus focus focus" })
    );
    const result = rankByRelevance("focus", candidates, 3, NOW);
    expect(result).toHaveLength(3);
  });

  it("is case-insensitive and tokenizes across punctuation", () => {
    const result = rankByRelevance(
      "Gemara",
      [candidate({ id: "x", text: "Learned GEMARA, today!" })],
      5,
      NOW
    );
    expect(result.map((r) => r.id)).toEqual(["x"]);
  });
});
