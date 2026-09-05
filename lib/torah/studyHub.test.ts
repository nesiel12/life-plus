import { describe, expect, it } from "vitest";
import { buildStudyHub, sectionItems } from "@/lib/torah/studyHub";
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

describe("sectionItems", () => {
  const summaries = [
    item({ id: "b", sectionId: "s1", sortOrder: 200 }),
    item({ id: "a", sectionId: "s1", sortOrder: 100 }),
    item({ id: "v", sectionId: "s1", sortOrder: 300, kind: "video" }),
    item({ id: "other", sectionId: "s2", sortOrder: 50 }),
  ];

  it("returns only that section's items, in order", () => {
    expect(sectionItems(summaries, "s1").map((s) => s.id)).toEqual(["a", "b", "v"]);
  });

  it("filters by kind when asked", () => {
    expect(sectionItems(summaries, "s1", "video").map((s) => s.id)).toEqual(["v"]);
    expect(sectionItems(summaries, "s1", "summary").map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("returns nothing for an unknown section", () => {
    expect(sectionItems(summaries, "missing")).toEqual([]);
  });

  it("does not mutate the input", () => {
    const before = summaries.map((s) => s.id);
    sectionItems(summaries, "s1");
    expect(summaries.map((s) => s.id)).toEqual(before);
  });
});
