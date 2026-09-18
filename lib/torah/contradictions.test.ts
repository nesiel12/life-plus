import { describe, expect, it } from "vitest";
import {
  contentTerms,
  contradictionCandidates,
  contradictionPrompt,
  contradictionSystemPrompt,
  hasRuling,
  orderPair,
  pairFingerprint,
  pairKey,
  relatedness,
  relevantExcerpt,
  shouldRaiseAlert,
  type ContradictionSide,
} from "@/lib/torah/contradictions";

const mishnaBerura: ContradictionSide = {
  type: "summary",
  id: "b-1",
  label: "הסיכום שלך על משנה ברורה",
  anchor: "book:mb",
  text: "טלטול מוקצה בשבת: כלי שמלאכתו לאיסור מותר לטלטל לצורך גופו ומקומו. מחמת חסרון כיס אסור בטלטול בכל מקרה.",
};
const rambam: ContradictionSide = {
  type: "summary",
  id: "a-2",
  label: "הסיכום שלך על הרמב״ם",
  anchor: "book:rambam",
  text: "לפי הרמב״ם כלי שמלאכתו לאיסור אסור לטלטל בשבת אפילו לצורך גופו ומקומו. זו שיטה מחמירה.",
};
const unrelated: ContradictionSide = {
  type: "lesson",
  id: "l-9",
  label: "השיעור: אהבת ישראל",
  anchor: "lesson:l-9",
  text: "אהבת ישראל היא יסוד התורה, וכל אדם צריך לראות את הטוב שבחברו ולדון אותו לכף זכות.",
};

describe("pair identity", () => {
  it("is the same in both directions", () => {
    expect(pairKey(mishnaBerura, rambam)).toBe(pairKey(rambam, mishnaBerura));
    expect(pairKey(mishnaBerura, rambam)).toBe("summary:a-2|summary:b-1");
  });

  it("orders the pair the way the alert row stores it", () => {
    expect(orderPair(mishnaBerura, rambam).map((s) => s.id)).toEqual(["a-2", "b-1"]);
    expect(orderPair(rambam, mishnaBerura).map((s) => s.id)).toEqual(["a-2", "b-1"]);
  });

  it("fingerprints content symmetrically and changes when a note changes", () => {
    const f = pairFingerprint(mishnaBerura, rambam);
    expect(f).toMatch(/^[0-9a-f]{8}$/);
    expect(pairFingerprint(rambam, mishnaBerura)).toBe(f);
    expect(pairFingerprint({ ...rambam, text: `${rambam.text} ועוד` }, mishnaBerura)).not.toBe(f);
  });
});

describe("terms and rulings", () => {
  it("drops function words and short tokens, folds punctuation", () => {
    const terms = contentTerms("של את הרמב״ם כותב שמוקצה אסור");
    expect(terms.has("של")).toBe(false);
    expect(terms.has("הרמבם")).toBe(true);
    expect(terms.has("אסור")).toBe(true);
  });

  it("detects rulings with prefix letters but not inside a longer word", () => {
    expect(hasRuling("ולכן מותר לטלטל")).toBe(true);
    expect(hasRuling("שאסור לעשות כן")).toBe(true);
    expect(hasRuling("בהפסקה בין הסדרים למדנו")).toBe(false);
    expect(hasRuling("סיפור יפה על חסד")).toBe(false);
  });

  it("scores notes on the same topic above unrelated ones", () => {
    expect(relatedness(mishnaBerura.text, rambam.text).score).toBeGreaterThan(0.3);
    expect(relatedness(mishnaBerura.text, unrelated.text).score).toBeLessThan(0.12);
  });
});

describe("relevantExcerpt", () => {
  it("keeps the sentences that share vocabulary, in original order", () => {
    const text = "פתיחה כללית על השבת. כלי שמלאכתו לאיסור מותר לצורך גופו. סיום על עונג שבת.";
    expect(relevantExcerpt(text, ["שמלאכתו", "לאיסור"])).toBe("כלי שמלאכתו לאיסור מותר לצורך גופו.");
  });

  it("stays within its budget", () => {
    const text = Array.from({ length: 40 }, () => "כלי שמלאכתו לאיסור מותר לצורך גופו.").join(" ");
    expect(relevantExcerpt(text, ["שמלאכתו"], 200).length).toBeLessThanOrEqual(201);
  });
});

describe("contradictionCandidates", () => {
  it("pairs related notes from different sources and skips unrelated ones", () => {
    const candidates = contradictionCandidates([mishnaBerura, rambam, unrelated]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].pairKey).toBe(pairKey(mishnaBerura, rambam));
    expect(candidates[0].left.id).toBe("a-2");
    expect(candidates[0].leftExcerpt).toContain("אסור");
    expect(candidates[0].rightExcerpt).toContain("מותר");
  });

  it("never pairs two notes on the same book", () => {
    const sameBook = { ...rambam, anchor: "book:mb" };
    expect(contradictionCandidates([mishnaBerura, sameBook])).toEqual([]);
  });

  it("skips pairs already judged with unchanged text, but re-judges edited ones", () => {
    const scanned = new Map([[pairKey(mishnaBerura, rambam), pairFingerprint(mishnaBerura, rambam)]]);
    expect(contradictionCandidates([mishnaBerura, rambam], { scanned })).toEqual([]);
    const edited = { ...rambam, text: `${rambam.text} אבל לצורך מקומו מותר.` };
    expect(contradictionCandidates([mishnaBerura, edited], { scanned })).toHaveLength(1);
  });

  it("ignores near-empty notes and respects the limit", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ ...rambam, id: `n${i}`, anchor: `book:${i}` }));
    expect(contradictionCandidates([...many, { ...mishnaBerura, text: "קצר" }], { limit: 4 })).toHaveLength(4);
  });
});

describe("verdicts and prompts", () => {
  it("raises only confident, explained conflicts", () => {
    const base = { conflict: true, kind: "halachic" as const, explanation: "בסיכום אחד מותר ובשני אסור", confidence: 0.8 };
    expect(shouldRaiseAlert(base)).toBe(true);
    expect(shouldRaiseAlert({ ...base, confidence: 0.5 })).toBe(false);
    expect(shouldRaiseAlert({ ...base, conflict: false })).toBe(false);
    expect(shouldRaiseAlert({ ...base, explanation: "סותר" })).toBe(false);
  });

  it("builds Hebrew prompts numbering each pair", () => {
    expect(contradictionSystemPrompt()).not.toMatch(/[A-Za-z]/);
    const prompt = contradictionPrompt(contradictionCandidates([mishnaBerura, rambam]));
    expect(prompt).toContain("זוג 1:");
    expect(prompt).toContain("א. הסיכום שלך על הרמב״ם");
  });
});
