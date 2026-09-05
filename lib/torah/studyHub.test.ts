import { describe, expect, it } from "vitest";
import { buildSectionHub, buildStudyHub, nextSortOrder } from "@/lib/torah/studyHub";
import type { EntitySources } from "@/lib/summaries/entityRef";
import type { KnowledgeEntry, Summary } from "@/types";

function item(overrides: Partial<Summary> & Pick<Summary, "id">): Summary {
  return {
    title: "כותרת",
    content: "תוכן",
    date: "2026-09-05",
    kind: "summary",
    sortOrder: 0,
    ...overrides,
  };
}

const RABBI = { entityType: "rabbi" as const, entityId: "r1", entityName: "הרב דניאל כהן" };

describe("buildStudyHub", () => {
  it("is empty when nothing relates to the entity", () => {
    const hub = buildStudyHub({ ...RABBI, summaries: [item({ id: "a" })] });
    expect(hub.total).toBe(0);
    expect(hub.summaries).toEqual([]);
  });

  it("collects items filed about the entity", () => {
    const hub = buildStudyHub({
      ...RABBI,
      summaries: [item({ id: "a", entityType: "rabbi", entityId: "r1" })],
    });
    expect(hub.summaries).toHaveLength(1);
    expect(hub.summaries[0].relation).toBe("filed");
  });

  // The point of the overhaul: a note about another book that quotes this
  // rabbi genuinely belongs on his page.
  it("also collects items that merely @mention the entity", () => {
    const hub = buildStudyHub({
      ...RABBI,
      summaries: [
        item({
          id: "a",
          entityType: "book",
          entityId: "b1",
          mentions: [{ type: "rabbi", id: "r1", label: "הרב דניאל כהן" }],
        }),
      ],
    });
    expect(hub.summaries).toHaveLength(1);
    expect(hub.summaries[0].relation).toBe("mentioned");
  });

  it("counts an item once when it is both filed and mentioned, preferring filed", () => {
    const hub = buildStudyHub({
      ...RABBI,
      summaries: [
        item({
          id: "a",
          entityType: "rabbi",
          entityId: "r1",
          mentions: [{ type: "rabbi", id: "r1", label: "x" }],
        }),
      ],
    });
    expect(hub.summaries).toHaveLength(1);
    expect(hub.summaries[0].relation).toBe("filed");
  });

  it("ignores a mention of a different entity of the same type", () => {
    const hub = buildStudyHub({
      ...RABBI,
      summaries: [item({ id: "a", mentions: [{ type: "rabbi", id: "r2", label: "אחר" }] })],
    });
    expect(hub.total).toBe(0);
  });

  it("ignores an id collision across entity types", () => {
    // A book with the same id must not appear on the rabbi's page.
    const hub = buildStudyHub({
      ...RABBI,
      summaries: [item({ id: "a", entityType: "book", entityId: "r1" })],
    });
    expect(hub.total).toBe(0);
  });

  describe("splits by kind", () => {
    const summaries = [
      item({ id: "s", entityType: "rabbi", entityId: "r1", kind: "summary" }),
      item({ id: "v", entityType: "rabbi", entityId: "r1", kind: "video", url: "https://youtu.be/x" }),
      item({ id: "u", entityType: "rabbi", entityId: "r1", kind: "source", url: "https://example.com" }),
    ];

    it("routes each item to its own bucket", () => {
      const hub = buildStudyHub({ ...RABBI, summaries });
      expect(hub.summaries.map((i) => i.summary.id)).toEqual(["s"]);
      expect(hub.videos.map((i) => i.summary.id)).toEqual(["v"]);
      expect(hub.sources.map((i) => i.summary.id)).toEqual(["u"]);
      expect(hub.total).toBe(3);
    });

    it("treats a missing kind as a summary, so pre-existing rows still appear", () => {
      const hub = buildStudyHub({
        ...RABBI,
        summaries: [{ ...item({ id: "old", entityType: "rabbi", entityId: "r1" }), kind: undefined }],
      });
      expect(hub.summaries).toHaveLength(1);
    });
  });

  describe("ordering", () => {
    it("respects the user's own order", () => {
      const hub = buildStudyHub({
        ...RABBI,
        summaries: [
          item({ id: "b", entityType: "rabbi", entityId: "r1", sortOrder: 200 }),
          item({ id: "a", entityType: "rabbi", entityId: "r1", sortOrder: 100 }),
        ],
      });
      expect(hub.summaries.map((i) => i.summary.id)).toEqual(["a", "b"]);
    });

    // What the user deliberately filed here should lead over something that
    // merely name-drops the entity.
    it("puts filed items ahead of mentioned ones", () => {
      const hub = buildStudyHub({
        ...RABBI,
        summaries: [
          item({ id: "mentioned", sortOrder: 10, mentions: [{ type: "rabbi", id: "r1", label: "x" }] }),
          item({ id: "filed", sortOrder: 900, entityType: "rabbi", entityId: "r1" }),
        ],
      });
      expect(hub.summaries.map((i) => i.summary.id)).toEqual(["filed", "mentioned"]);
    });
  });

  describe("related knowledge entries", () => {
    const entries: KnowledgeEntry[] = [
      { id: "k1", date: "2026-09-01", topic: "שיעור של הרב דניאל כהן", source: "יוטיוב", summary: "" },
      { id: "k2", date: "2026-09-02", topic: "נושא אחר", source: "ספר", summary: "" },
      { id: "k3", date: "2026-09-03", topic: "כללי", source: "הרב דניאל כהן", summary: "" },
    ];

    it("matches on topic or source", () => {
      const hub = buildStudyHub({ ...RABBI, summaries: [], knowledgeEntries: entries });
      expect(hub.relatedEntries.map((e) => e.id).sort()).toEqual(["k1", "k3"]);
    });

    it("is case-insensitive", () => {
      const hub = buildStudyHub({
        entityType: "book",
        entityId: "b1",
        entityName: "עט הלב",
        summaries: [],
        knowledgeEntries: [{ id: "k", date: "d", topic: "עט הלב", source: "", summary: "" }],
      });
      expect(hub.relatedEntries).toHaveLength(1);
    });

    // A one-character name would match nearly everything.
    it("refuses to match on a name too short to be meaningful", () => {
      const hub = buildStudyHub({
        entityType: "rabbi",
        entityId: "r",
        entityName: "א",
        summaries: [],
        knowledgeEntries: entries,
      });
      expect(hub.relatedEntries).toEqual([]);
    });

    it("counts entries toward the total", () => {
      const hub = buildStudyHub({ ...RABBI, summaries: [], knowledgeEntries: entries });
      expect(hub.total).toBe(2);
    });
  });
});

const SOURCES: EntitySources = {
  books: [{ id: "b1", title: "עט הלב" }],
  rabbis: [{ id: "r1", name: "הרב דניאל כהן" }],
  people: [],
  sections: [{ id: "s1", name: "פרשת שבוע", sortOrder: 100 }],
};

describe("item origin", () => {
  it("names the section a borrowed item actually lives in", () => {
    const hub = buildStudyHub({
      ...RABBI,
      sources: SOURCES,
      summaries: [
        item({ id: "a", sectionId: "s1", mentions: [{ type: "rabbi", id: "r1", label: "x" }] }),
      ],
    });
    expect(hub.summaries[0]).toMatchObject({ relation: "mentioned", origin: "פרשת שבוע" });
  });

  it("names the entity when the item is filed under one instead", () => {
    const hub = buildStudyHub({
      ...RABBI,
      sources: SOURCES,
      summaries: [
        item({
          id: "a",
          entityType: "book",
          entityId: "b1",
          mentions: [{ type: "rabbi", id: "r1", label: "x" }],
        }),
      ],
    });
    expect(hub.summaries[0].origin).toBe("עט הלב");
  });

  // Same dangling-reference tolerance as the mention layer: a deleted book
  // must produce no origin rather than a stale one.
  it("has no origin when the entity it was filed under is gone", () => {
    const hub = buildStudyHub({
      ...RABBI,
      sources: SOURCES,
      summaries: [
        item({
          id: "a",
          entityType: "book",
          entityId: "deleted",
          mentions: [{ type: "rabbi", id: "r1", label: "x" }],
        }),
      ],
    });
    expect(hub.summaries[0].origin).toBeUndefined();
  });

  it("has no origin for a loose item filed nowhere", () => {
    const hub = buildStudyHub({
      ...RABBI,
      sources: SOURCES,
      summaries: [item({ id: "a", mentions: [{ type: "rabbi", id: "r1", label: "x" }] })],
    });
    expect(hub.summaries[0].origin).toBeUndefined();
  });

  it("omits origin entirely when no sources are supplied", () => {
    const hub = buildStudyHub({
      ...RABBI,
      summaries: [item({ id: "a", sectionId: "s1", entityType: "rabbi", entityId: "r1" })],
    });
    expect(hub.summaries[0].origin).toBeUndefined();
  });
});

describe("buildSectionHub", () => {
  it("returns the section's own items, in the user's order", () => {
    const items = buildSectionHub({
      sectionId: "s1",
      summaries: [
        item({ id: "b", sectionId: "s1", sortOrder: 200 }),
        item({ id: "a", sectionId: "s1", sortOrder: 100 }),
        item({ id: "other", sectionId: "s2", sortOrder: 50 }),
      ],
    });
    expect(items.map((i) => i.summary.id)).toEqual(["a", "b"]);
    expect(items.every((i) => i.relation === "filed")).toBe(true);
  });

  it("keeps every kind in one stream rather than splitting them", () => {
    const items = buildSectionHub({
      sectionId: "s1",
      summaries: [
        item({ id: "v", sectionId: "s1", sortOrder: 100, kind: "video" }),
        item({ id: "n", sectionId: "s1", sortOrder: 200, kind: "summary" }),
        item({ id: "u", sectionId: "s1", sortOrder: 300, kind: "source" }),
      ],
    });
    expect(items.map((i) => i.summary.id)).toEqual(["v", "n", "u"]);
  });

  // The reverse direction: mentioning a section from a rabbi's page has to
  // show up in the section, or the link is one-way.
  it("also collects items that @mention the section from elsewhere", () => {
    const items = buildSectionHub({
      sectionId: "s1",
      sources: SOURCES,
      summaries: [
        item({
          id: "elsewhere",
          entityType: "rabbi",
          entityId: "r1",
          mentions: [{ type: "section", id: "s1", label: "פרשת שבוע" }],
        }),
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ relation: "mentioned", origin: "הרב דניאל כהן" });
  });

  it("puts the section's own items ahead of borrowed ones", () => {
    const items = buildSectionHub({
      sectionId: "s1",
      summaries: [
        item({ id: "borrowed", sortOrder: 10, mentions: [{ type: "section", id: "s1", label: "x" }] }),
        item({ id: "own", sectionId: "s1", sortOrder: 900 }),
      ],
    });
    expect(items.map((i) => i.summary.id)).toEqual(["own", "borrowed"]);
  });

  it("counts an item once when it is both filed here and mentions the section", () => {
    const items = buildSectionHub({
      sectionId: "s1",
      summaries: [
        item({ id: "a", sectionId: "s1", mentions: [{ type: "section", id: "s1", label: "x" }] }),
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0].relation).toBe("filed");
  });

  it("ignores a mention of a different section", () => {
    const items = buildSectionHub({
      sectionId: "s1",
      summaries: [item({ id: "a", mentions: [{ type: "section", id: "s2", label: "x" }] })],
    });
    expect(items).toEqual([]);
  });
});

describe("nextSortOrder", () => {
  const existing = [
    item({ id: "a", sectionId: "s1", sortOrder: 100 }),
    item({ id: "b", sectionId: "s1", sortOrder: 200 }),
    item({ id: "c", entityType: "rabbi", entityId: "r1", sortOrder: 700 }),
  ];

  it("puts a new section item after the section's last one", () => {
    expect(nextSortOrder(existing, { sectionId: "s1" })).toBeGreaterThan(200);
  });

  // The bug this exists to prevent: ranking against everything would drop a
  // new note into an arbitrary position in its own list.
  it("ignores items filed somewhere else", () => {
    expect(nextSortOrder(existing, { sectionId: "s1" })).toBeLessThan(700);
  });

  it("orders an entity item against that entity's own items", () => {
    expect(nextSortOrder(existing, { entityType: "rabbi", entityId: "r1" })).toBeGreaterThan(700);
  });

  it("does not treat a borrowed mention as a sibling", () => {
    const withMention = [
      ...existing,
      item({ id: "m", sortOrder: 9000, mentions: [{ type: "section", id: "s1", label: "x" }] }),
    ];
    expect(nextSortOrder(withMention, { sectionId: "s1" })).toBeLessThan(9000);
  });

  it("handles an empty destination", () => {
    expect(nextSortOrder([], { sectionId: "fresh" })).toBeGreaterThan(0);
  });
});
