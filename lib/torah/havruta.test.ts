import { describe, expect, it } from "vitest";
import {
  clip,
  havrutaOpeners,
  havrutaPrompt,
  havrutaSystemPrompt,
  havrutaThreadTitle,
  insightsPrompt,
  normalizeInsights,
  normalizeMoves,
  parseStoredInsights,
  trimHistory,
  type HavrutaSubject,
} from "@/lib/torah/havruta";

const LATIN = /[A-Za-z]/;

const book: HavrutaSubject = {
  type: "book",
  title: "משנה ברורה",
  byline: "רבי ישראל מאיר הכהן",
  background: "פירוש על שולחן ערוך אורח חיים.",
  points: ["הלכות שבת", "הלכות תפילה"],
  notes: [{ title: "מוקצה", text: "כלי שמלאכתו לאיסור מותר לצורך גופו ומקומו." }],
};

describe("havrutaSystemPrompt", () => {
  it("is Hebrew only in every mode — the model is never shown English to translate", () => {
    for (const mode of ["debate", "clarify", "contradiction"] as const) {
      const prompt = havrutaSystemPrompt(mode, book);
      expect(prompt).not.toMatch(LATIN);
      expect(prompt).toContain("משנה ברורה");
    }
  });

  it("gives each mode its own behaviour", () => {
    expect(havrutaSystemPrompt("debate", book)).toContain("לאתגר");
    expect(havrutaSystemPrompt("debate", book)).toContain("ראשונים והאחרונים");
    expect(havrutaSystemPrompt("clarify", book)).toContain("רמז");
    expect(havrutaSystemPrompt("contradiction", book)).toContain("חילוק");
  });

  it("forbids invented sources and practical rulings in every mode", () => {
    for (const mode of ["debate", "clarify", "contradiction"] as const) {
      const prompt = havrutaSystemPrompt(mode, book);
      expect(prompt).toContain("לעולם אל תמציא מראה מקום");
      expect(prompt).toContain("אל תפסוק הלכה למעשה");
    }
  });

  it("names a rabbi subject by the person, not as a quoted title", () => {
    expect(havrutaSystemPrompt("debate", { type: "rabbi", title: "הרמב״ם" })).toContain("שיטתו ותורתו של הרמב״ם");
  });
});

describe("havrutaPrompt", () => {
  it("includes the subject, the learner's notes, the history and the new message, in that order", () => {
    const prompt = havrutaPrompt({
      subject: book,
      history: [
        { role: "user", content: "מוקצה מחמת גופו אסור בטלטול" },
        { role: "assistant", content: "ומה לגבי כלי שמלאכתו לאיסור?" },
      ],
      message: "מותר לצורך גופו",
    });
    const order = ["משנה ברורה — רבי ישראל", "רקע:", "נקודות מרכזיות:", "מה שהלומד כתב", "הדיון עד כה:", "הלומד אומר עכשיו: מותר לצורך גופו"];
    const positions = order.map((part) => prompt.indexOf(part));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(prompt).toContain("החברותא: ומה לגבי");
  });

  it("presents both sides of a contradiction", () => {
    const prompt = havrutaPrompt({
      subject: {
        type: "contradiction",
        title: "סתירה",
        contradiction: {
          left: { label: "הסיכום על משנה ברורה", excerpt: "מותר" },
          right: { label: "הסיכום על הרמב״ם", excerpt: "אסור" },
          explanation: "פסק שונה באותו מקרה",
        },
      },
      history: [],
      message: "אולי יש חילוק?",
    });
    expect(prompt).toContain('בצד אחד — הסיכום על משנה ברורה: "מותר"');
    expect(prompt).toContain('ובצד שני — הסיכום על הרמב״ם: "אסור"');
  });

  it("bounds the notes it sends", () => {
    const notes = Array.from({ length: 12 }, (_, i) => ({ title: `סיכום ${i}`, text: "א".repeat(5000) }));
    const prompt = havrutaPrompt({ subject: { ...book, notes }, history: [], message: "שאלה" });
    expect(prompt).toContain("סיכום 4");
    expect(prompt).not.toContain("סיכום 5");
    expect(prompt.length).toBeLessThan(6000);
  });
});

describe("trimHistory", () => {
  const turns = Array.from({ length: 20 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", content: `תור ${i}` }));

  it("keeps the most recent turns, oldest first", () => {
    const kept = trimHistory(turns, { maxTurns: 3, maxChars: 1000 });
    expect(kept.map((t) => t.content)).toEqual(["תור 17", "תור 18", "תור 19"]);
  });

  it("stops at the character budget", () => {
    const long = [{ role: "user" as const, content: "א".repeat(100) }, { role: "assistant" as const, content: "ב".repeat(100) }];
    expect(trimHistory(long, { maxTurns: 10, maxChars: 150 })).toHaveLength(1);
  });

  it("skips empty turns", () => {
    expect(trimHistory([{ role: "user", content: "   " }, { role: "assistant", content: "כן" }])).toHaveLength(1);
  });
});

describe("openers and titles", () => {
  it("offers subject-specific Hebrew openers", () => {
    expect(havrutaOpeners("debate", "rabbi")[0]).toContain("שיטתו");
    expect(havrutaOpeners("contradiction", "contradiction")).toHaveLength(3);
    for (const o of havrutaOpeners("clarify", "lesson")) expect(o).not.toMatch(LATIN);
  });

  it("titles a thread by mode and subject", () => {
    expect(havrutaThreadTitle("debate", "משנה ברורה")).toBe("פלפול · משנה ברורה");
  });
});

describe("normalizeMoves", () => {
  it("keeps known moves, once each, at most three", () => {
    expect(normalizeMoves(["kushya", "kushya", "nonsense", "shita", "chizuk", "birur"])).toEqual(["kushya", "shita", "chizuk"]);
    expect(normalizeMoves(undefined)).toEqual([]);
  });
});

describe("insights", () => {
  it("cleans, dedupes and caps", () => {
    const raw = [
      { text: "כלי שמלאכתו לאיסור מותר לצורך גופו", kind: "chiddush" },
      { text: "כלי שמלאכתו לאיסור מותר לצורך גופו", kind: "chiddush" },
      { text: "קצר", kind: "kushya" },
      { text: "נשארה השאלה מה דין מחמת חסרון כיס", kind: "kushya" },
      { text: "יישבנו שהמשנה ברורה מחמיר רק לכתחילה", kind: "weird" },
      { text: "עוד תובנה ארוכה מספיק כדי להיכנס", kind: "resolution" },
      { text: "ועוד תובנה חמישית שלא תיכנס", kind: "resolution" },
    ];
    const out = normalizeInsights(raw);
    expect(out).toHaveLength(4);
    expect(out[2]).toEqual({ text: "יישבנו שהמשנה ברורה מחמיר רק לכתחילה", kind: "chiddush" });
  });

  it("reads stored jsonb defensively", () => {
    expect(parseStoredInsights(null)).toEqual([]);
    expect(parseStoredInsights([{ nope: 1 }, { text: "תובנה אמיתית מהדיון", kind: "resolution" }])).toEqual([
      { text: "תובנה אמיתית מהדיון", kind: "resolution" },
    ]);
  });

  it("builds a Hebrew insights prompt from the thread", () => {
    const prompt = insightsPrompt("משנה ברורה", [{ role: "user", content: "שאלה" }, { role: "assistant", content: "תשובה" }]);
    expect(prompt).toContain("הלומד: שאלה");
    expect(prompt).toContain("החברותא: תשובה");
  });
});

describe("clip", () => {
  it("cuts at a word boundary with an ellipsis", () => {
    expect(clip("אחת שתיים שלוש ארבע", 12)).toBe("אחת שתיים…");
    expect(clip("קצר", 10)).toBe("קצר");
  });
});
