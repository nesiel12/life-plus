import { describe, expect, it } from "vitest";
import { durationLabel, formatTimecode, parseIsoDuration, parseTimecode, promptTimecode } from "@/lib/torah/lessons/timecode";
import {
  activeLineIndex,
  appendWindowLines,
  normalizeCaptions,
  normalizeWindowLines,
  planWindows,
  textBetween,
  transcriptForPrompt,
  type TranscriptLine,
} from "@/lib/torah/lessons/transcript";
import { buildLearningChunks, collectCitationCandidates, normalizeChapters, referenceVariants } from "@/lib/torah/lessons/analysis";

describe("timecodes", () => {
  it("parses the shapes models actually return", () => {
    expect(parseTimecode("12:34")).toBe(754);
    expect(parseTimecode("1:02:03")).toBe(3723);
    expect(parseTimecode("00:05")).toBe(5);
    expect(parseTimecode("12.34")).toBe(754);
    expect(parseTimecode("90")).toBe(90);
    expect(parseTimecode(42)).toBe(42);
  });

  it("rejects impossible values instead of seeking to garbage", () => {
    expect(parseTimecode("00:75")).toBeNull();
    expect(parseTimecode("abc")).toBeNull();
    expect(parseTimecode("")).toBeNull();
    expect(parseTimecode(-3)).toBeNull();
    expect(parseTimecode("1:2:3:4")).toBeNull();
  });

  it("formats for display and for prompts", () => {
    expect(formatTimecode(754)).toBe("12:34");
    expect(formatTimecode(3723)).toBe("1:02:03");
    expect(promptTimecode(65)).toBe("01:05");
    expect(promptTimecode(3723)).toBe("01:02:03");
  });

  it("parses YouTube's ISO durations", () => {
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
    expect(parseIsoDuration("PT45M")).toBe(2700);
    expect(parseIsoDuration("P1DT1S")).toBe(86401);
    expect(parseIsoDuration("nonsense")).toBeNull();
  });

  it("labels durations in Hebrew", () => {
    expect(durationLabel(2700)).toBe("45 דק׳");
    expect(durationLabel(3900)).toBe("1 ש׳ 5 דק׳");
    expect(durationLabel(null)).toBeNull();
  });
});

describe("planWindows", () => {
  it("covers the whole media in fixed windows", () => {
    expect(planWindows(1500, 600)).toEqual([
      { start: 0, end: 600 },
      { start: 600, end: 1200 },
      { start: 1200, end: 1500 },
    ]);
  });

  it("folds a short trailing sliver into the previous window", () => {
    expect(planWindows(1230, 600)).toEqual([
      { start: 0, end: 600 },
      { start: 600, end: 1230 },
    ]);
  });

  it("returns nothing for zero-length media", () => {
    expect(planWindows(0, 600)).toEqual([]);
  });
});

describe("normalizeWindowLines", () => {
  const window = { start: 600, end: 1200 };

  it("keeps absolute timestamps and fills ends from the next line", () => {
    expect(
      normalizeWindowLines(
        [
          { start: "10:00", text: "פתיחה" },
          { start: "10:30", text: "המשך" },
        ],
        window
      )
    ).toEqual([
      { start: 600, end: 630, text: "פתיחה" },
      { start: 630, end: 1200, text: "המשך" },
    ]);
  });

  it("shifts timestamps a model wrote relative to the window", () => {
    const lines = normalizeWindowLines(
      [
        { start: "00:00", text: "א" },
        { start: "00:45", text: "ב" },
      ],
      window
    );
    expect(lines.map((l) => l.start)).toEqual([600, 645]);
  });

  it("interpolates missing times between known neighbours", () => {
    const lines = normalizeWindowLines(
      [
        { start: "10:00", text: "א" },
        { start: null, text: "ב" },
        { start: "10:20", text: "ג" },
      ],
      window
    );
    expect(lines.map((l) => l.start)).toEqual([600, 610, 620]);
  });

  it("never lets a line go backwards in time", () => {
    const lines = normalizeWindowLines(
      [
        { start: "10:10", text: "א" },
        { start: "10:05", text: "ב" },
      ],
      window
    );
    expect(lines.map((l) => l.start)).toEqual([610, 610]);
  });

  it("drops empty lines and strips foreign-script drift", () => {
    const lines = normalizeWindowLines(
      [
        { start: "10:00", text: "  " },
        { start: "10:01", text: "האדם בזה העולם" },
        { start: "10:02", text: "הАдם" },
      ],
      window
    );
    expect(lines.map((l) => l.text)).toEqual(["האדם בזה העולם"]);
  });
});

describe("appendWindowLines", () => {
  const first: TranscriptLine[] = [
    { start: 0, end: 30, text: "א" },
    { start: 30, end: 600, text: "ב" },
  ];

  it("stitches the previous window's last end to the next window's first start", () => {
    const merged = appendWindowLines(first, [{ start: 598, end: 640, text: "ג" }]);
    expect(merged).toEqual([
      { start: 0, end: 30, text: "א" },
      { start: 30, end: 598, text: "ב" },
      { start: 598, end: 640, text: "ג" },
    ]);
  });

  it("does not duplicate a retried window", () => {
    expect(appendWindowLines(first, [{ start: 0, end: 30, text: "א" }])).toEqual(first);
  });
});

describe("normalizeCaptions", () => {
  it("reads srv3 millisecond offsets", () => {
    const lines = normalizeCaptions([
      { text: "שלום", offset: 0, duration: 1500 },
      { text: "וברכה.", offset: 1500, duration: 1200 },
      { text: "נתחיל", offset: 3000, duration: 1000 },
    ]);
    expect(lines).toEqual([
      { start: 0, end: 3, text: "שלום וברכה." },
      { start: 3, end: 4, text: "נתחיל" },
    ]);
  });

  it("reads classic second offsets", () => {
    const lines = normalizeCaptions(
      [
        { text: "פרק א.", offset: 1.5, duration: 2.2 },
        { text: "פרק ב.", offset: 4.1, duration: 2 },
      ],
      120
    );
    expect(lines.map((l) => l.start)).toEqual([1, 4]);
  });

  it("uses the video duration to decide units when known", () => {
    const lines = normalizeCaptions([{ text: "סוף.", offset: 50_000, duration: 2 }], 60);
    expect(lines[0].start).toBe(50);
  });

  it("reads a long video's millisecond offsets even when durations are short and no length is known", () => {
    // Captured from a real 18-minute video: integer ms offsets, but caption
    // durations in the tens, which the "median duration ≥ 100" rule alone misses.
    const lines = normalizeCaptions([
      { text: "התחלה.", offset: 4220, duration: 60 },
      { text: "אמצע.", offset: 600_000, duration: 40 },
      { text: "סוף.", offset: 1_105_100, duration: 54 },
    ]);
    expect(lines.map((l) => l.start)).toEqual([4, 600, 1105]);
  });

  it("removes bracketed sound cues", () => {
    expect(normalizeCaptions([{ text: "[מוזיקה] שלום.", offset: 0, duration: 1 }], 10)[0].text).toBe("שלום.");
  });
});

describe("transcript helpers", () => {
  const lines: TranscriptLine[] = [
    { start: 0, end: 10, text: "א" },
    { start: 10, end: 20, text: "ב" },
    { start: 20, end: 30, text: "ג" },
  ];

  it("finds the playing line", () => {
    expect(activeLineIndex(lines, 0)).toBe(0);
    expect(activeLineIndex(lines, 15)).toBe(1);
    expect(activeLineIndex(lines, 999)).toBe(2);
    expect(activeLineIndex([{ start: 5, end: 6, text: "x" }], 1)).toBe(-1);
  });

  it("renders timestamps for the model and compresses instead of truncating", () => {
    expect(transcriptForPrompt(lines)).toBe("[00:00] א\n[00:10] ב\n[00:20] ג");
    const compressed = transcriptForPrompt(lines, 20);
    expect(compressed.startsWith("[00:00] א ב")).toBe(true);
  });

  it("extracts the text between two times", () => {
    expect(textBetween(lines, 10, 30)).toBe("ב ג");
    expect(textBetween(lines, 20, null)).toBe("ג");
  });
});

describe("normalizeChapters", () => {
  it("orders, starts at zero, merges near-duplicates, and chains ends", () => {
    expect(
      normalizeChapters(
        [
          { start: "05:00", title: "ראיות" },
          { start: "00:12", title: "פתיחה" },
          { start: "05:10", title: "ראיות שוב" },
          { start: "99:00", title: "מעבר לסוף" },
        ],
        900
      )
    ).toEqual([
      { startSeconds: 0, endSeconds: 300, title: "פתיחה", summary: null, sortOrder: 0 },
      { startSeconds: 300, endSeconds: null, title: "ראיות", summary: null, sortOrder: 1 },
    ]);
  });
});

describe("collectCitationCandidates", () => {
  const lines: TranscriptLine[] = [
    { start: 0, end: 30, text: "נפתח בגמרא בבבא מציעא נ״ט ע״ב" },
    { start: 30, end: 60, text: "וכמו שכתוב בבראשית א, א" },
    { start: 400, end: 430, text: "חוזרים לבבא מציעא נ״ט ע״ב" },
  ];

  it("finds citations in the transcript on its own, timed by line", () => {
    const candidates = collectCitationCandidates(lines, []);
    expect(candidates.map((c) => [c.sefariaRef, c.atSeconds, c.mentions])).toEqual([
      ["Bava Metzia 59b", 0, 2],
      ["Genesis 1:1", 30, 1],
    ]);
  });

  it("merges the model's citation of the same source instead of listing it twice", () => {
    const candidates = collectCitationCandidates(lines, [
      { quote: "תנורו של עכנאי", reference: "בבא מציעא נ״ט ע״ב", at: "00:05", confidence: 0.8 },
    ]);
    expect(candidates.filter((c) => c.sefariaRef === "Bava Metzia 59b")).toHaveLength(1);
  });

  it("keeps a model citation the detector cannot parse, for Sefaria's own parser", () => {
    const [candidate] = collectCitationCandidates([], [
      { quote: "כמו שכותב המסילת ישרים", reference: "מסילת ישרים פרק א", at: "12:00", kind: "book", confidence: 0.6 },
    ]);
    expect(candidate).toMatchObject({
      reference: "מסילת ישרים פרק א",
      atSeconds: 720,
      kind: "book",
      confidence: 0.6,
      sefariaRef: undefined,
    });
  });
});

describe("buildLearningChunks", () => {
  const lines: TranscriptLine[] = Array.from({ length: 30 }, (_, i) => ({
    start: i * 60,
    end: (i + 1) * 60,
    text: `שורה ${i}`,
  }));

  it("splits on chapter boundaries at roughly equal study time", () => {
    const chapters = [0, 240, 540, 900, 1260, 1560].map((start, i, all) => ({
      startSeconds: start,
      endSeconds: all[i + 1] ?? null,
      title: `פרק ${i + 1}`,
      summary: null,
      sortOrder: i,
    }));
    const chunks = buildLearningChunks(lines, chapters, 1800, { targetSeconds: 600 });
    expect(chunks.map((c) => [c.ordinal, c.startSeconds, c.endSeconds, c.title])).toEqual([
      [0, 0, 900, "פרק 1 · פרק 2 ועוד"],
      [1, 900, 1260, "פרק 4"],
      [2, 1260, null, "פרק 5 · פרק 6"],
    ]);
  });

  it("splits on time alone when there are no chapters", () => {
    const chunks = buildLearningChunks(lines, [], 1800, { targetSeconds: 600 });
    expect(chunks.map((c) => [c.startSeconds, c.title])).toEqual([
      [0, "חלק 1"],
      [600, "חלק 2"],
      [1200, "חלק 3"],
    ]);
    expect(chunks[0].body.startsWith("שורה 0 שורה 1")).toBe(true);
  });

  it("returns nothing without a transcript", () => {
    expect(buildLearningChunks([], [], 100)).toEqual([]);
  });
});

describe("referenceVariants", () => {
  it("strips the wording Sefaria's parser rejects", () => {
    expect(referenceVariants("מסכת בבא מציעא דף נט עמוד ב")).toContain("בבא מציעא נט ב");
    expect(referenceVariants("שמות פרק כג פסוק ב")).toContain("שמות כג ב");
  });

  it("reduces a Mishneh Torah citation to the form that resolves", () => {
    expect(referenceVariants(`משנה תורה להרמב"ם הלכות יסודי התורה פרק ט' הלכה א'`)).toContain(
      "הלכות יסודי התורה ט א"
    );
  });

  it("keeps the original first and never returns duplicates", () => {
    const variants = referenceVariants("בבא מציעא נט ב");
    expect(variants[0]).toBe("בבא מציעא נט ב");
    expect(new Set(variants).size).toBe(variants.length);
    expect(referenceVariants("  ")).toEqual([]);
  });
});
