import { describe, expect, it } from "vitest";
import {
  SHEET_LIMITS,
  buildShabbatSheet,
  clipAtSentence,
  hebrewWeekRange,
  parashaTitle,
  sheetWeek,
  zonedMidnight,
  type SheetInput,
} from "@/lib/torah/shabbatSheet";

const TZ = "Asia/Jerusalem";
// Thursday 2026-10-08, 15:00 in Jerusalem (UTC+3). Shabbat Bereshit is 10-10.
const NOW = new Date("2026-10-08T12:00:00Z");

describe("the week", () => {
  it("finds local midnight in a zone", () => {
    expect(zonedMidnight(2026, 10, 4, TZ).toISOString()).toBe("2026-10-03T21:00:00.000Z");
    // Winter time (UTC+2) after the October change.
    expect(zonedMidnight(2026, 12, 6, TZ).toISOString()).toBe("2026-12-05T22:00:00.000Z");
  });

  it("runs Sunday through Shabbat in the learner's zone", () => {
    const week = sheetWeek(NOW, TZ);
    expect(week.start.toISOString()).toBe("2026-10-03T21:00:00.000Z");
    expect(week.end.toISOString()).toBe("2026-10-10T21:00:00.000Z");
    expect(week.shabbatDate).toBe("2026-10-10");
  });

  it("treats Shabbat itself as the end of the current week", () => {
    expect(sheetWeek(new Date("2026-10-10T09:00:00Z"), TZ).shabbatDate).toBe("2026-10-10");
    // Saturday 23:30 local is still Shabbat's calendar day in this model.
    expect(sheetWeek(new Date("2026-10-10T20:30:00Z"), TZ).shabbatDate).toBe("2026-10-10");
    // Sunday 00:30 local starts the next week.
    expect(sheetWeek(new Date("2026-10-10T21:30:00Z"), TZ).shabbatDate).toBe("2026-10-17");
  });

  it("steps back by whole weeks", () => {
    expect(sheetWeek(NOW, TZ, -1).shabbatDate).toBe("2026-10-03");
    expect(sheetWeek(NOW, TZ, -2).shabbatDate).toBe("2026-09-26");
  });
});

describe("Hebrew calendar labels", () => {
  it("names the parasha without niqqud", () => {
    expect(parashaTitle("2026-10-10")).toBe("פרשת בראשית");
    expect(parashaTitle("2027-03-27")).toBe("פרשת צו");
  });

  it("names a festival Shabbat", () => {
    expect(parashaTitle("2026-09-26")).toBe("שבת סוכות");
  });

  it("renders the week's Hebrew date range compactly", () => {
    const range = hebrewWeekRange("2026-10-10");
    expect(range).not.toMatch(/[֑-ׇ]/);
    expect(range).toMatch(/^[א-ת״׳]+ – [א-ת״׳]+ תשרי תשפ״ז$/);
  });
});

describe("clipAtSentence", () => {
  it("prefers a sentence end", () => {
    expect(clipAtSentence("משפט ראשון ארוך מאוד. משפט שני ארוך מאוד מאוד מאוד.", 30)).toBe("משפט ראשון ארוך מאוד.");
  });

  it("falls back to a word boundary", () => {
    expect(clipAtSentence("מילה מילה מילה מילה מילה מילה", 14)).toBe("מילה מילה…");
  });
});

const inWeek = "2026-10-06T10:00:00Z";
const lastWeek = "2026-09-30T10:00:00Z";

function input(overrides: Partial<SheetInput> = {}): SheetInput {
  return {
    now: NOW,
    timeZone: TZ,
    summaries: [
      { id: "s1", title: "מוקצה", content: "כלי שמלאכתו לאיסור מותר לצורך גופו.", updatedAt: inWeek, subject: "משנה ברורה" },
      { id: "s2", title: "ישן", content: "משבוע שעבר", updatedAt: lastWeek },
      { id: "s3", title: "טיוטה", content: "לא גמור", updatedAt: inWeek, isDraft: true },
    ],
    lessons: [
      { id: "l1", title: "הלכות שבת", summary: "סיכום השיעור.", keyPoints: ["א", " ", "ב"], status: "ready", processedAt: inWeek, speaker: "הרב" },
      { id: "l2", title: "בעיבוד", summary: null, keyPoints: [], status: "transcribing", processedAt: null },
    ],
    threads: [
      { id: "t1", title: "פלפול · מוקצה", insights: [{ text: "חידוש מהדיון", kind: "chiddush" }], updatedAt: inWeek },
      { id: "t2", title: "ללא תובנות", insights: [], updatedAt: inWeek },
    ],
    questions: [
      { id: "q1", prompt: "מה הדין?", modelAnswer: "מותר", kind: "recall", createdAt: inWeek },
      { id: "q2", prompt: "חבר טוען…", modelAnswer: "יש לחלק", kind: "scenario", createdAt: inWeek, lessonTitle: "הלכות שבת" },
      { id: "q3", prompt: "בלי תשובה", modelAnswer: null, kind: "scenario", createdAt: inWeek },
    ],
    cards: [
      { id: "c1", front: "מוקצה?", back: "דבר שאינו מוכן", lapses: 0, easeFactor: 2.5, createdAt: inWeek, lastReviewedAt: null },
      { id: "c2", front: "חסרון כיס?", back: "אסור", lapses: 3, easeFactor: 1.7, createdAt: lastWeek, lastReviewedAt: inWeek },
      { id: "c3", front: "ישן ויציב", back: "…", lapses: 0, easeFactor: 2.8, createdAt: lastWeek, lastReviewedAt: inWeek },
      { id: "c4", front: "מושהה", back: "…", lapses: 5, easeFactor: 1.3, createdAt: inWeek, lastReviewedAt: inWeek, suspended: true },
    ],
    ...overrides,
  };
}

describe("buildShabbatSheet", () => {
  const sheet = buildShabbatSheet(input());

  it("titles the sheet by the week's parasha", () => {
    expect(sheet.parasha).toBe("פרשת בראשית");
    expect(sheet.isEmpty).toBe(false);
  });

  it("includes only this week's finished summaries and ready lessons", () => {
    expect(sheet.summaries.map((s) => s.id)).toEqual(["s1"]);
    expect(sheet.summaries[0].subject).toBe("משנה ברורה");
    expect(sheet.lessons.map((l) => l.id)).toEqual(["l1"]);
    expect(sheet.lessons[0].keyPoints).toEqual(["א", "ב"]);
  });

  it("includes only threads that produced insights", () => {
    expect(sheet.insights.map((i) => i.threadId)).toEqual(["t1"]);
  });

  it("puts scenario questions first and requires an answer", () => {
    expect(sheet.questions.map((q) => q.id)).toEqual(["q2", "q1"]);
    expect(sheet.questions[0].source).toBe("הלכות שבת");
  });

  it("picks new cards and this week's slipping cards, slipping first, never suspended", () => {
    expect(sheet.cards.map((c) => c.id)).toEqual(["c2", "c1"]);
  });

  it("caps and clips long content", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      id: `x${i}`,
      title: `סיכום ${i}`,
      content: "משפט ארוך מאוד. ".repeat(200),
      updatedAt: inWeek,
    }));
    const big = buildShabbatSheet(input({ summaries: many }));
    expect(big.summaries).toHaveLength(SHEET_LIMITS.summaries);
    expect(big.summaries[0].body.length).toBeLessThanOrEqual(SHEET_LIMITS.summaryChars);
  });

  it("is empty for a week with nothing learned", () => {
    expect(buildShabbatSheet(input({ weekOffset: -3 })).isEmpty).toBe(true);
  });
});
