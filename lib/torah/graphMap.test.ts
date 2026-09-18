import { describe, expect, it } from "vitest";
import {
  buildMapGraph,
  capMapGraph,
  connectionLabel,
  edgeKindFor,
  eraBucket,
  filterMapGraph,
  mapCategories,
  mapEras,
  nodeConnections,
  searchMapNodes,
  type MapGraphInput,
} from "@/lib/torah/graphMap";
import type { KgEdge } from "@/lib/torah/graph";

const edge = (partial: Partial<KgEdge> & Pick<KgEdge, "fromType" | "fromId" | "toType" | "toId" | "relation">): KgEdge => ({
  id: `${partial.fromId}-${partial.toId}`,
  weight: 1,
  origin: "user",
  ...partial,
});

const input: MapGraphInput = {
  rabbis: [
    { id: "chafetz", name: "Chafetz Chaim", hebrewName: "החפץ חיים", era: "AH" },
    { id: "rambam", name: "הרמב״ם", era: "ראשונים" },
    { id: "kook", name: "הרב קוק", deathYear: 1935 },
    { id: "teacher", name: "רבי עקיבא איגר", era: null, deathYear: 1837 },
  ],
  books: [
    { id: "mb", title: "Mishna Berura", hebrewTitle: "משנה ברורה", category: "הלכה", authorRabbiId: "chafetz", description: "פירוש על שולחן ערוך אורח חיים" },
    { id: "yad", title: "משנה תורה", category: "הלכה", author: "הרמב״ם", description: "An English blurb that must not show" },
    { id: "mesilat", title: "מסילת ישרים", category: null },
  ],
  lessons: [{ id: "l1", title: "הלכות מוקצה", bookId: "mb", rabbiId: "kook" }],
  concepts: [{ id: "c1", term: "מוקצה", mentionCount: 3 }],
  edges: [
    edge({ fromType: "book", fromId: "yad", toType: "rabbi", toId: "rambam", relation: "authored_by", origin: "import" }),
    edge({ fromType: "rabbi", fromId: "chafetz", toType: "rabbi", toId: "teacher", relation: "taught_by", origin: "ai", weight: 0.6 }),
    edge({ fromType: "book", fromId: "mb", toType: "book", toId: "yad", relation: "quotes" }),
    edge({ fromType: "lesson", fromId: "l1", toType: "topic", toId: "מוקצה", relation: "discusses", origin: "ai", weight: 0.7 }),
    // Duplicates an implicit link with a weaker origin — the user's must win.
    edge({ fromType: "book", fromId: "mb", toType: "rabbi", toId: "chafetz", relation: "authored_by", origin: "ai", weight: 0.4 }),
    // Dangling: no such book.
    edge({ fromType: "book", fromId: "ghost", toType: "rabbi", toId: "rambam", relation: "authored_by" }),
    // Summaries are not map nodes.
    edge({ fromType: "summary", fromId: "s1", toType: "book", toId: "mb", relation: "about" }),
  ],
};

describe("eraBucket", () => {
  it("reads Sefaria codes and Hebrew labels", () => {
    expect(eraBucket({ era: "AH" })).toBe("acharonim");
    expect(eraBucket({ era: "RI" })).toBe("rishonim");
    expect(eraBucket({ era: "ראשונים" })).toBe("rishonim");
    expect(eraBucket({ era: "תנאים" })).toBe("tannaim");
    expect(eraBucket({ era: "GN" })).toBe("geonim");
  });

  it("falls back to dates, and 'contemporary' wins", () => {
    expect(eraBucket({ deathYear: 1204 })).toBe("rishonim");
    expect(eraBucket({ deathYear: 1935 })).toBe("acharonim");
    expect(eraBucket({ birthYear: 1950 })).toBe("modern");
    expect(eraBucket({ era: "AH", isContemporary: true })).toBe("modern");
    expect(eraBucket({})).toBe("unknown");
  });
});

describe("edgeKindFor", () => {
  it("maps the table vocabulary to the map's", () => {
    expect(edgeKindFor("taught_by")).toBe("student_of");
    expect(edgeKindFor("quotes")).toBe("cites");
    expect(edgeKindFor("commentary_on")).toBe("cites");
    expect(edgeKindFor("discusses")).toBe("related_concept");
  });
});

describe("buildMapGraph", () => {
  const graph = buildMapGraph(input);
  const keys = graph.nodes.map((n) => n.key).sort();

  it("creates a node per book, rabbi, lesson and concept, with Hebrew labels and links", () => {
    expect(keys).toEqual(
      ["book:mb", "book:mesilat", "book:yad", "concept:c1", "lesson:l1", "rabbi:chafetz", "rabbi:kook", "rabbi:rambam", "rabbi:teacher"].sort()
    );
    const mb = graph.nodes.find((n) => n.key === "book:mb")!;
    expect(mb).toMatchObject({ label: "משנה ברורה", sublabel: "החפץ חיים", era: "acharonim", category: "הלכה", href: "/areas/torah/books/mb" });
  });

  it("shows Hebrew previews only", () => {
    expect(graph.nodes.find((n) => n.key === "book:mb")!.preview).toBe("פירוש על שולחן ערוך אורח חיים");
    expect(graph.nodes.find((n) => n.key === "book:yad")!.preview).toBeUndefined();
  });

  it("merges kg_edges with implicit links, keeping the strongest origin", () => {
    const authored = graph.edges.filter((e) => e.from === "book:mb" && e.kind === "authored_by");
    expect(authored).toHaveLength(1);
    expect(authored[0]).toMatchObject({ origin: "user", weight: 1 });
    expect(graph.edges.some((e) => e.from === "lesson:l1" && e.to === "rabbi:kook" && e.kind === "given_by")).toBe(true);
    expect(graph.edges.some((e) => e.from === "lesson:l1" && e.to === "book:mb" && e.kind === "cites")).toBe(true);
  });

  it("resolves topic endpoints through the glossary and drops dangling or non-map edges", () => {
    expect(graph.edges.some((e) => e.from === "lesson:l1" && e.to === "concept:c1")).toBe(true);
    expect(graph.edges.some((e) => e.from.includes("ghost") || e.from.startsWith("summary"))).toBe(false);
  });

  it("computes degrees from the final edge set", () => {
    const degree = Object.fromEntries(graph.nodes.map((n) => [n.key, n.degree]));
    expect(degree["book:mesilat"]).toBe(0);
    expect(degree["book:mb"]).toBe(3); // authored_by, quotes, lesson cites
  });
});

describe("filterMapGraph", () => {
  const graph = buildMapGraph(input);

  it("filters by node type and drops their edges", () => {
    const onlyRabbisAndBooks = filterMapGraph(graph, { types: new Set(["rabbi", "book"]) });
    expect(onlyRabbisAndBooks.nodes.every((n) => n.type === "rabbi" || n.type === "book")).toBe(true);
    expect(onlyRabbisAndBooks.edges.some((e) => e.from.startsWith("lesson"))).toBe(false);
  });

  it("filters rabbis and books by era, keeping lessons only through a surviving connection", () => {
    const rishonim = filterMapGraph(graph, { eras: new Set(["rishonim"]) });
    expect(rishonim.nodes.map((n) => n.key).sort()).toEqual(["rabbi:rambam"]);

    const acharonim = filterMapGraph(graph, { eras: new Set(["acharonim"]) });
    expect(acharonim.nodes.map((n) => n.key)).toContain("lesson:l1");
    expect(acharonim.nodes.map((n) => n.key)).toContain("rabbi:kook");
  });

  it("filters books by category, with '' meaning uncategorised", () => {
    const uncategorised = filterMapGraph(graph, { categories: new Set([""]), types: new Set(["book"]) });
    expect(uncategorised.nodes.map((n) => n.key)).toEqual(["book:mesilat"]);
  });

  it("filters edge kinds and can hide isolated nodes", () => {
    const lineage = filterMapGraph(graph, { edgeKinds: new Set(["student_of"]), hideIsolated: true });
    expect(lineage.nodes.map((n) => n.key).sort()).toEqual(["rabbi:chafetz", "rabbi:teacher"]);
    expect(lineage.edges).toHaveLength(1);
  });
});

describe("helpers", () => {
  const graph = buildMapGraph(input);

  it("lists categories and eras present", () => {
    expect(mapCategories(graph)).toEqual(["הלכה", ""]);
    expect(mapEras(graph)).toEqual(["rishonim", "acharonim", "unknown"]);
  });

  it("caps to the most connected nodes", () => {
    const { graph: capped, hidden } = capMapGraph(graph, 3);
    expect(capped.nodes).toHaveLength(3);
    expect(hidden).toBe(6);
    expect(capped.nodes.map((n) => n.key)).toContain("book:mb");
    expect(capped.edges.every((e) => capped.nodes.some((n) => n.key === e.from))).toBe(true);
  });

  it("searches Hebrew labels ignoring gershayim and honorifics, best match first", () => {
    expect(searchMapNodes(graph.nodes, "רמבם")[0].key).toBe("rabbi:rambam");
    expect(searchMapNodes(graph.nodes, "קוק")[0].key).toBe("rabbi:kook");
    expect(searchMapNodes(graph.nodes, "משנה").map((n) => n.key)).toEqual(["book:mb", "book:yad"]);
    expect(searchMapNodes(graph.nodes, "  ")).toEqual([]);
  });

  it("reads connections from the inspected node's side", () => {
    const fromRabbi = nodeConnections(graph, "rabbi:chafetz");
    const book = fromRabbi.find((c) => c.node.key === "book:mb")!;
    expect(book.outgoing).toBe(false);
    expect(connectionLabel(book.edge.kind, book.outgoing)).toBe("חיבר את");
    const teacher = fromRabbi.find((c) => c.node.key === "rabbi:teacher")!;
    expect(connectionLabel(teacher.edge.kind, teacher.outgoing)).toBe("תלמיד של");
  });
});
