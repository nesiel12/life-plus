import { describe, expect, it } from "vitest";
import type { StepBriefContent } from "@/types/learning";
import {
  buildMatchingRound,
  calibrationFor,
  conceptGraphLayout,
  fixRecallBlank,
  isRecallCorrect,
  normalizeAnswer,
  normalizeStepBrief,
  seededShuffle,
  splitRecallSentence,
  streamingPreview,
} from "./stepBrief";

function brief(overrides: Partial<StepBriefContent> = {}): StepBriefContent {
  return {
    summary: "סיכום",
    coreConcepts: [
      { term: "אור", definition: "ד1", relatedTo: ["כלורופיל", "אור", "לא קיים", "כלורופיל"] },
      { term: "כלורופיל", definition: "ד2", relatedTo: ["אור"] },
    ],
    keyFigures: [],
    visual: { kind: "none", title: "", processStages: [], comparisonColumns: [], comparisonRows: [] },
    recall: [],
    feynmanConcept: "פוטוסינתזה",
    practice: { title: "ת", instructions: "הוראות", estimatedMinutes: 10 },
    ...overrides,
  };
}

describe("normalizeStepBrief", () => {
  it("keeps only real, distinct, non-self relations", () => {
    const out = normalizeStepBrief(brief());
    expect(out.coreConcepts[0].relatedTo).toEqual(["כלורופיל"]);
  });

  it("pads and trims comparison cells to the column count", () => {
    const out = normalizeStepBrief(
      brief({
        visual: {
          kind: "comparison",
          title: "t",
          processStages: [],
          comparisonColumns: ["א", "ב"],
          comparisonRows: [
            { label: "r1", cells: ["1"] },
            { label: "r2", cells: ["1", "2", "3"] },
          ],
        },
      })
    );
    expect(out.visual.comparisonRows.map((r) => r.cells)).toEqual([
      ["1", "—"],
      ["1", "2"],
    ]);
  });

  it("drops a process with fewer than two stages", () => {
    const out = normalizeStepBrief(brief({ visual: { kind: "process", title: "", processStages: [{ title: "a", detail: "" }], comparisonColumns: [], comparisonRows: [] } }));
    expect(out.visual.kind).toBe("none");
  });

  it("drops a comparison with a single column", () => {
    const out = normalizeStepBrief(brief({ visual: { kind: "comparison", title: "", processStages: [], comparisonColumns: ["a"], comparisonRows: [{ label: "x", cells: ["1"] }] } }));
    expect(out.visual.kind).toBe("none");
  });
});

describe("fixRecallBlank", () => {
  const base = { answer: "כלורופיל", acceptableAnswers: [], hint: "" };
  it("keeps a sentence with exactly one blank", () => {
    expect(fixRecallBlank({ ...base, sentence: "הצבע הירוק הוא ___." })?.sentence).toBe("הצבע הירוק הוא ___.");
  });
  it("replaces the answer with a blank when the model forgot it", () => {
    expect(fixRecallBlank({ ...base, sentence: "הצבע הירוק הוא כלורופיל." })?.sentence).toBe("הצבע הירוק הוא ___.");
  });
  it("drops sentences with two blanks or no recoverable answer", () => {
    expect(fixRecallBlank({ ...base, sentence: "___ ו-___" })).toBeNull();
    expect(fixRecallBlank({ ...base, sentence: "אין פה כלום" })).toBeNull();
  });
});

describe("splitRecallSentence", () => {
  it("splits around the blank", () => {
    expect(splitRecallSentence("א ___ ב")).toEqual(["א ", " ב"]);
  });
});

describe("isRecallCorrect", () => {
  const item = { answer: "פוטוסינתזה", acceptableAnswers: ["הטמעה"] };
  it("ignores punctuation, niqqud, case and spacing", () => {
    expect(normalizeAnswer("  Pho-to  ")).toBe("pho to");
    expect(isRecallCorrect(item, " פוֹטוֹסִינְתֶזָה! ")).toBe(true);
  });
  it("accepts listed synonyms", () => {
    expect(isRecallCorrect(item, "הטמעה")).toBe(true);
  });
  it("accepts a single Hebrew prefix letter on the input", () => {
    expect(isRecallCorrect(item, "הפוטוסינתזה")).toBe(true);
    expect(isRecallCorrect(item, "בפוטוסינתזה")).toBe(true);
  });
  it("rejects wrong and empty answers, and never strips two letters", () => {
    expect(isRecallCorrect(item, "נשימה")).toBe(false);
    expect(isRecallCorrect(item, "   ")).toBe(false);
    expect(isRecallCorrect(item, "והפוטוסינתזה")).toBe(false);
  });
  it("does not strip a prefix down to a too-short word", () => {
    expect(isRecallCorrect({ answer: "אב", acceptableAnswers: [] }, "האב")).toBe(false);
  });
});

describe("calibrationFor", () => {
  it("classifies all four quadrants", () => {
    expect(calibrationFor(4, true)).toBe("calibrated-correct");
    expect(calibrationFor(1, true)).toBe("underconfident");
    expect(calibrationFor(3, false)).toBe("overconfident");
    expect(calibrationFor(2, false)).toBe("calibrated-wrong");
  });
});

describe("matching and shuffle", () => {
  it("shuffles deterministically and keeps every item", () => {
    const a = seededShuffle([1, 2, 3, 4, 5], "seed");
    expect(seededShuffle([1, 2, 3, 4, 5], "seed")).toEqual(a);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5]);
  });
  it("needs at least two concepts", () => {
    expect(buildMatchingRound([{ term: "a", definition: "d", relatedTo: [] }], "s")).toBeNull();
  });
  it("caps the round size and offers exactly the prompts' terms", () => {
    const concepts = ["a", "b", "c", "d", "e"].map((t) => ({ term: t, definition: t + "!", relatedTo: [] }));
    const round = buildMatchingRound(concepts, "s")!;
    expect(round.prompts).toHaveLength(4);
    expect([...round.terms].sort()).toEqual(["a", "b", "c", "d"]);
  });
});

describe("conceptGraphLayout", () => {
  it("places nodes inside the box and de-duplicates undirected edges", () => {
    const { nodes, edges } = conceptGraphLayout(
      [
        { term: "a", definition: "", relatedTo: ["b"] },
        { term: "b", definition: "", relatedTo: ["a", "c"] },
        { term: "c", definition: "", relatedTo: [] },
      ],
      400,
      300
    );
    expect(edges).toEqual([
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ]);
    for (const n of nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(400);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeLessThanOrEqual(300);
    }
  });
  it("centres a single node", () => {
    expect(conceptGraphLayout([{ term: "a", definition: "", relatedTo: [] }], 200, 100).nodes[0]).toEqual({ term: "a", x: 100, y: 50 });
  });
});

describe("streamingPreview", () => {
  it("tolerates garbage and keeps only complete concepts", () => {
    expect(streamingPreview(null)).toEqual({ summary: "", concepts: [] });
    expect(
      streamingPreview({ summary: "חצי מש", coreConcepts: [{ term: "a", definition: "d" }, { term: "b" }, null, { term: "", definition: "x" }] })
    ).toEqual({ summary: "חצי מש", concepts: [{ term: "a", definition: "d" }] });
  });
});
