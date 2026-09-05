import { describe, expect, it } from "vitest";
import {
  buildSectionTree,
  eligibleParents,
  orderSummaries,
  sectionAndDescendants,
  wouldExceedDepth,
} from "@/lib/summaries/hierarchy";
import type { Summary, SummarySection } from "@/types";

function section(overrides: Partial<SummarySection> & Pick<SummarySection, "id">): SummarySection {
  return { name: `מדור ${overrides.id}`, sortOrder: 100, ...overrides };
}

function summary(overrides: Partial<Summary> & Pick<Summary, "id">): Summary {
  return { title: "כותרת", content: "", date: "2026-09-06", sortOrder: 100, ...overrides };
}

describe("buildSectionTree", () => {
  it("is empty for no sections", () => {
    expect(buildSectionTree([])).toEqual([]);
  });

  it("treats a section with no parent as top level", () => {
    const tree = buildSectionTree([section({ id: "a" })]);
    expect(tree).toHaveLength(1);
    expect(tree[0].children).toEqual([]);
  });

  it("nests a child under its parent", () => {
    const tree = buildSectionTree([section({ id: "p" }), section({ id: "c", parentId: "p" })]);
    expect(tree).toHaveLength(1);
    expect(tree[0].section.id).toBe("p");
    expect(tree[0].children.map((c) => c.id)).toEqual(["c"]);
  });

  it("orders roots by the user's sort order", () => {
    const tree = buildSectionTree([
      section({ id: "b", sortOrder: 200 }),
      section({ id: "a", sortOrder: 100 }),
    ]);
    expect(tree.map((n) => n.section.id)).toEqual(["a", "b"]);
  });

  it("orders children by their own sort order", () => {
    const tree = buildSectionTree([
      section({ id: "p" }),
      section({ id: "c2", parentId: "p", sortOrder: 200 }),
      section({ id: "c1", parentId: "p", sortOrder: 100 }),
    ]);
    expect(tree[0].children.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  describe("bad references degrade to top level rather than vanishing", () => {
    // Losing a section from the nav hides the user's material with no way
    // to reach it. Showing it at the top is wrong where they can see it.
    it("promotes a section whose parent does not exist", () => {
      const tree = buildSectionTree([section({ id: "orphan", parentId: "gone" })]);
      expect(tree.map((n) => n.section.id)).toEqual(["orphan"]);
    });

    it("promotes a section that is its own parent", () => {
      const tree = buildSectionTree([section({ id: "loop", parentId: "loop" })]);
      expect(tree.map((n) => n.section.id)).toEqual(["loop"]);
      expect(tree[0].children).toEqual([]);
    });

    // The depth cap: a grandchild is promoted, not nested two deep.
    it("promotes a child of a child", () => {
      const tree = buildSectionTree([
        section({ id: "p" }),
        section({ id: "c", parentId: "p" }),
        section({ id: "g", parentId: "c" }),
      ]);
      expect(tree.map((n) => n.section.id).sort()).toEqual(["g", "p"]);
      expect(tree.find((n) => n.section.id === "p")?.children.map((c) => c.id)).toEqual(["c"]);
      expect(tree.find((n) => n.section.id === "g")?.children).toEqual([]);
    });

    it("survives a two-section cycle without recursing forever", () => {
      const tree = buildSectionTree([
        section({ id: "a", parentId: "b" }),
        section({ id: "b", parentId: "a" }),
      ]);
      // Both have a parent that is itself parented, so both are promoted.
      expect(tree.map((n) => n.section.id).sort()).toEqual(["a", "b"]);
    });

    it("never lists a promoted section as both a root and a child", () => {
      const tree = buildSectionTree([
        section({ id: "p" }),
        section({ id: "c", parentId: "p" }),
        section({ id: "g", parentId: "c" }),
      ]);
      const asChild = tree.flatMap((n) => n.children.map((c) => c.id));
      const asRoot = tree.map((n) => n.section.id);
      expect(asRoot.filter((id) => asChild.includes(id))).toEqual([]);
    });
  });

  describe("pinning", () => {
    it("puts a pinned section ahead of an unpinned one", () => {
      const tree = buildSectionTree([
        section({ id: "plain", sortOrder: 100 }),
        section({ id: "pinned", sortOrder: 900, pinnedAt: "2026-09-01T00:00:00Z" }),
      ]);
      expect(tree.map((n) => n.section.id)).toEqual(["pinned", "plain"]);
    });

    // The reason the column is a timestamp and not a boolean.
    it("orders several pins newest first", () => {
      const tree = buildSectionTree([
        section({ id: "old", sortOrder: 100, pinnedAt: "2026-01-01T00:00:00Z" }),
        section({ id: "new", sortOrder: 200, pinnedAt: "2026-09-01T00:00:00Z" }),
      ]);
      expect(tree.map((n) => n.section.id)).toEqual(["new", "old"]);
    });

    it("falls back to sort order for pins at the same instant", () => {
      const at = "2026-09-01T00:00:00Z";
      const tree = buildSectionTree([
        section({ id: "b", sortOrder: 200, pinnedAt: at }),
        section({ id: "a", sortOrder: 100, pinnedAt: at }),
      ]);
      expect(tree.map((n) => n.section.id)).toEqual(["a", "b"]);
    });

    it("pins children within their parent too", () => {
      const tree = buildSectionTree([
        section({ id: "p" }),
        section({ id: "c1", parentId: "p", sortOrder: 100 }),
        section({ id: "c2", parentId: "p", sortOrder: 200, pinnedAt: "2026-09-01T00:00:00Z" }),
      ]);
      expect(tree[0].children.map((c) => c.id)).toEqual(["c2", "c1"]);
    });
  });

  it("does not mutate the input", () => {
    const sections = [section({ id: "b", sortOrder: 200 }), section({ id: "a", sortOrder: 100 })];
    const order = sections.map((s) => s.id);
    buildSectionTree(sections);
    expect(sections.map((s) => s.id)).toEqual(order);
  });
});

describe("eligibleParents", () => {
  const flat = [section({ id: "a" }), section({ id: "b" }), section({ id: "c" })];

  it("offers every other top-level section", () => {
    expect(eligibleParents(flat, "a").map((s) => s.id).sort()).toEqual(["b", "c"]);
  });

  it("never offers the section itself", () => {
    expect(eligibleParents(flat, "a").map((s) => s.id)).not.toContain("a");
  });

  it("does not offer an existing child as a parent", () => {
    const withChild = [...flat, section({ id: "child", parentId: "a" })];
    expect(eligibleParents(withChild, "b").map((s) => s.id)).not.toContain("child");
  });

  // Adopting a parent would drag this section's own children to depth two.
  it("offers nothing for a section that already has children", () => {
    const withChild = [...flat, section({ id: "child", parentId: "a" })];
    expect(eligibleParents(withChild, "a")).toEqual([]);
  });

  it("offers everything when no section is named", () => {
    expect(eligibleParents(flat)).toHaveLength(3);
  });
});

describe("wouldExceedDepth", () => {
  const sections = [
    section({ id: "p" }),
    section({ id: "c", parentId: "p" }),
    section({ id: "other" }),
  ];

  it("allows promoting to top level", () => {
    expect(wouldExceedDepth(sections, "c", null)).toBe(false);
  });

  it("allows a top-level section to become a child of another", () => {
    expect(wouldExceedDepth(sections, "other", "p")).toBe(false);
  });

  it("rejects a section becoming its own parent", () => {
    expect(wouldExceedDepth(sections, "p", "p")).toBe(true);
  });

  it("rejects parenting under a section that is already a child", () => {
    expect(wouldExceedDepth(sections, "other", "c")).toBe(true);
  });

  it("rejects moving a section that has children of its own", () => {
    expect(wouldExceedDepth(sections, "p", "other")).toBe(true);
  });

  it("allows a move onto a parent that does not exist rather than blocking", () => {
    // The write will fail its foreign key; the UI should not pre-emptively
    // claim a depth problem that is not the actual one.
    expect(wouldExceedDepth(sections, "other", "missing")).toBe(false);
  });
});

describe("orderSummaries", () => {
  it("puts pinned summaries first", () => {
    const out = orderSummaries([
      summary({ id: "plain", sortOrder: 100 }),
      summary({ id: "pinned", sortOrder: 900, pinnedAt: "2026-09-01T00:00:00Z" }),
    ]);
    expect(out.map((s) => s.id)).toEqual(["pinned", "plain"]);
  });

  it("orders pins newest first", () => {
    const out = orderSummaries([
      summary({ id: "old", pinnedAt: "2026-01-01T00:00:00Z" }),
      summary({ id: "new", pinnedAt: "2026-09-01T00:00:00Z" }),
    ]);
    expect(out.map((s) => s.id)).toEqual(["new", "old"]);
  });

  it("keeps the user's order among unpinned items", () => {
    const out = orderSummaries([
      summary({ id: "b", sortOrder: 200 }),
      summary({ id: "a", sortOrder: 100 }),
    ]);
    expect(out.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("treats a missing sortOrder as 0 rather than dropping the item", () => {
    const out = orderSummaries([summary({ id: "a", sortOrder: undefined })]);
    expect(out.map((s) => s.id)).toEqual(["a"]);
  });

  it("does not mutate the input", () => {
    const items = [summary({ id: "b", sortOrder: 200 }), summary({ id: "a", sortOrder: 100 })];
    const order = items.map((s) => s.id);
    orderSummaries(items);
    expect(items.map((s) => s.id)).toEqual(order);
  });
});

describe("sectionAndDescendants", () => {
  const sections = [
    section({ id: "p" }),
    section({ id: "c1", parentId: "p" }),
    section({ id: "c2", parentId: "p" }),
    section({ id: "other" }),
  ];

  it("includes the section and its children", () => {
    expect(sectionAndDescendants(sections, "p").sort()).toEqual(["c1", "c2", "p"]);
  });

  it("is just the section when it has no children", () => {
    expect(sectionAndDescendants(sections, "other")).toEqual(["other"]);
  });

  it("returns the id even for a section that does not exist", () => {
    expect(sectionAndDescendants(sections, "ghost")).toEqual(["ghost"]);
  });
});
