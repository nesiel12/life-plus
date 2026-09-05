import { describe, expect, it } from "vitest";
import {
  allCandidates,
  extractMentions,
  resolveEntities,
  resolveEntity,
  searchEntities,
  type EntitySources,
} from "@/lib/summaries/entityRef";

const sources: EntitySources = {
  books: [
    { id: "b1", title: "עט הלב", author: "הרב דניאל כהן" },
    { id: "b2", title: "מסילת ישרים", author: "רמח״ל" },
  ],
  rabbis: [
    { id: "r1", name: "הרב דניאל כהן", title: "ראש ישיבה" },
    { id: "r2", name: "הרב שלמה לוי" },
  ],
  people: [{ id: "p1", name: "Dana", hebrewName: "דנה", relation: "אחות" }],
  topics: ["מוסר"],
};

describe("resolveEntity", () => {
  it("resolves an existing book to its current title and a page", () => {
    const r = resolveEntity({ type: "book", id: "b1", label: "עט הלב" }, sources);
    expect(r.exists).toBe(true);
    expect(r.currentLabel).toBe("עט הלב");
    expect(r.href).toBe("/areas/torah");
  });

  it("prefers a person's Hebrew name", () => {
    expect(resolveEntity({ type: "person", id: "p1", label: "Dana" }, sources).currentLabel).toBe("דנה");
  });

  // The point of keeping the stored label: prose written about a book must
  // still read correctly after the book is renamed.
  it("reports a rename via currentLabel while keeping the original label", () => {
    const renamed: EntitySources = { ...sources, books: [{ id: "b1", title: "עט הלב — מהדורה חדשה" }] };
    const r = resolveEntity({ type: "book", id: "b1", label: "עט הלב" }, renamed);
    expect(r.label).toBe("עט הלב");
    expect(r.currentLabel).toBe("עט הלב — מהדורה חדשה");
    expect(r.exists).toBe(true);
  });

  // No foreign key means dangling references are expected, not exceptional.
  it("degrades a deleted entity to plain text with no link", () => {
    const r = resolveEntity({ type: "book", id: "gone", label: "ספר שנמחק" }, sources);
    expect(r.exists).toBe(false);
    expect(r.currentLabel).toBe("ספר שנמחק");
    expect(r.href).toBeNull();
  });

  it("resolves a topic to itself and gives it no page", () => {
    const r = resolveEntity({ type: "topic", id: "מוסר", label: "מוסר" }, sources);
    expect(r.exists).toBe(true);
    expect(r.href).toBeNull();
  });

  it("resolves a list, keeping order", () => {
    const out = resolveEntities(
      [
        { type: "rabbi", id: "r1", label: "x" },
        { type: "book", id: "b2", label: "y" },
      ],
      sources
    );
    expect(out.map((e) => e.currentLabel)).toEqual(["הרב דניאל כהן", "מסילת ישרים"]);
  });
});

describe("allCandidates", () => {
  it("includes every entity kind", () => {
    const types = new Set(allCandidates(sources).map((c) => c.type));
    expect(types).toEqual(new Set(["book", "rabbi", "person", "topic"]));
  });

  it("survives absent topics", () => {
    expect(() => allCandidates({ books: [], rabbis: [], people: [] })).not.toThrow();
  });
});

describe("searchEntities", () => {
  it("returns a head of the list for an empty query, so '@' alone shows something", () => {
    expect(searchEntities("", sources).length).toBeGreaterThan(0);
  });

  it("finds by prefix", () => {
    expect(searchEntities("עט", sources)[0].label).toBe("עט הלב");
  });

  // Someone typing "@דנ" means a name starting with it; burying that under a
  // mid-word match makes the picker feel wrong.
  it("ranks a prefix match above a substring match", () => {
    const local: EntitySources = {
      books: [{ id: "x", title: "ספר על דנה" }],
      rabbis: [],
      people: [{ id: "p1", name: "דנה", relation: "אחות" }],
    };
    expect(searchEntities("דנה", local)[0].type).toBe("person");
  });

  it("matches the detail line too, so an author finds their book", () => {
    const hits = searchEntities("רמח", sources);
    expect(hits.some((h) => h.label === "מסילת ישרים")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(searchEntities("dana", sources).length).toBe(0); // hebrewName wins as the label
    expect(searchEntities("DANA", { ...sources, people: [{ id: "p", name: "Dana", relation: "x" }] })).toHaveLength(1);
  });

  it("returns nothing for a query that matches nothing", () => {
    expect(searchEntities("zzzzz", sources)).toEqual([]);
  });

  it("respects the limit", () => {
    expect(searchEntities("", sources, 2)).toHaveLength(2);
  });
});

describe("extractMentions", () => {
  const mention = (type: string, id: string, label: string) =>
    `<span data-entity-type="${type}" data-entity-id="${id}" data-label="${label}">@${label}</span>`;

  it("pulls a mention out of editor HTML", () => {
    const refs = extractMentions(`<p>קראתי את ${mention("book", "b1", "עט הלב")} היום</p>`);
    expect(refs).toEqual([{ type: "book", id: "b1", label: "עט הלב" }]);
  });

  it("finds several mentions of different kinds", () => {
    const html = `<p>${mention("book", "b1", "עט הלב")} מאת ${mention("rabbi", "r1", "הרב דניאל כהן")}</p>`;
    expect(extractMentions(html)).toHaveLength(2);
  });

  it("deduplicates the same entity mentioned twice", () => {
    const html = `<p>${mention("book", "b1", "עט הלב")} ... ${mention("book", "b1", "עט הלב")}</p>`;
    expect(extractMentions(html)).toHaveLength(1);
  });

  // Reading data attributes rather than matching "@word" is what makes these
  // two cases work.
  it("ignores a literal @ typed in prose", () => {
    expect(extractMentions("<p>שלחתי מייל ל-@דנה אתמול</p>")).toEqual([]);
  });

  it("handles a label containing spaces", () => {
    const refs = extractMentions(`<p>${mention("rabbi", "r1", "הרב דניאל כהן")}</p>`);
    expect(refs[0].label).toBe("הרב דניאל כהן");
  });

  it("decodes escaped characters in a label", () => {
    const html = `<span data-entity-type="topic" data-entity-id="t" data-label="מוסר &amp; מידות">@x</span>`;
    expect(extractMentions(html)[0].label).toBe("מוסר & מידות");
  });

  it("skips an unknown entity type rather than trusting it", () => {
    expect(extractMentions(`<span data-entity-type="alien" data-entity-id="x" data-label="y">@y</span>`)).toEqual([]);
  });

  it("returns nothing for empty or mention-free HTML", () => {
    expect(extractMentions("")).toEqual([]);
    expect(extractMentions("<p>סתם טקסט</p>")).toEqual([]);
  });
});
