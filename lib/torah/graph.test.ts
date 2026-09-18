import { describe, expect, it } from "vitest";
import {
  degreeByNode,
  neighbours,
  nodeKey,
  parseNodeKey,
  shortestPath,
  studentLineage,
  subgraphAround,
  teacherLineage,
  walk,
  type KgEdge,
  type KgNodeType,
  type KgRelation,
} from "@/lib/torah/graph";

let nextId = 0;

function edge(
  from: `${KgNodeType}:${string}`,
  relation: KgRelation,
  to: `${KgNodeType}:${string}`,
  overrides: Partial<KgEdge> = {}
): KgEdge {
  const fromRef = parseNodeKey(from);
  const toRef = parseNodeKey(to);
  return {
    id: `e${nextId++}`,
    fromType: fromRef.type,
    fromId: fromRef.id,
    toType: toRef.type,
    toId: toRef.id,
    relation,
    weight: 1,
    origin: "user",
    ...overrides,
  };
}

const ref = (key: `${KgNodeType}:${string}`) => parseNodeKey(key);

describe("nodeKey / parseNodeKey", () => {
  it("round-trips a uuid-shaped id", () => {
    const node = { type: "book" as const, id: "5f1a-2b" };
    expect(parseNodeKey(nodeKey(node))).toEqual(node);
  });

  it("keeps colons inside a topic label", () => {
    // A topic's id is its label, so the separator can legitimately recur.
    const node = { type: "topic" as const, id: "הלכה: שבת" };
    expect(parseNodeKey(nodeKey(node))).toEqual(node);
  });
});

describe("walk", () => {
  const edges = [
    edge("book:mb", "authored_by", "rabbi:chafetz-chaim"),
    edge("rabbi:chafetz-chaim", "taught_by", "rabbi:teacher"),
    edge("rabbi:teacher", "taught_by", "rabbi:grand-teacher"),
  ];

  it("reaches nodes at increasing depth", () => {
    const hits = walk(edges, ref("book:mb"), { maxDepth: 3 });
    expect(hits.map((h) => h.node.id)).toEqual(["chafetz-chaim", "teacher", "grand-teacher"]);
    expect(hits.map((h) => h.depth)).toEqual([1, 2, 3]);
  });

  it("stops at maxDepth", () => {
    const hits = walk(edges, ref("book:mb"), { maxDepth: 1 });
    expect(hits).toHaveLength(1);
    expect(hits[0].node.id).toBe("chafetz-chaim");
  });

  it("returns nothing for a non-positive depth", () => {
    expect(walk(edges, ref("book:mb"), { maxDepth: 0 })).toEqual([]);
  });

  it("records the route that reached each node", () => {
    const hits = walk(edges, ref("book:mb"), { maxDepth: 3 });
    expect(hits[2].path).toEqual([
      "book:mb",
      "rabbi:chafetz-chaim",
      "rabbi:teacher",
      "rabbi:grand-teacher",
    ]);
  });

  it("filters by relation", () => {
    const mixed = [
      edge("lesson:1", "quotes", "book:mb"),
      edge("lesson:1", "about", "concept:hashgacha"),
    ];
    const hits = walk(mixed, ref("lesson:1"), { relations: ["quotes"] });
    expect(hits.map((h) => h.node.id)).toEqual(["mb"]);
  });

  it("drops edges below minWeight", () => {
    const guesses = [
      edge("book:a", "related_to", "book:b", { weight: 0.2, origin: "ai" }),
      edge("book:a", "related_to", "book:c", { weight: 0.9, origin: "ai" }),
    ];
    const hits = walk(guesses, ref("book:a"), { minWeight: 0.5 });
    expect(hits.map((h) => h.node.id)).toEqual(["c"]);
  });

  it("follows edges backwards when direction is 'in'", () => {
    const hits = walk(edges, ref("rabbi:chafetz-chaim"), { direction: "in" });
    expect(hits.map((h) => h.node.id)).toEqual(["mb"]);
  });

  it("follows both directions when asked", () => {
    const hits = walk(edges, ref("rabbi:chafetz-chaim"), { direction: "both", maxDepth: 1 });
    expect(hits.map((h) => h.node.id).sort()).toEqual(["mb", "teacher"]);
  });

  // The case that hangs a naive implementation. Two rabbis each recorded as
  // the other's teacher is not hypothetical — it is what conflicting sources
  // produce.
  it("terminates on a two-node cycle", () => {
    const cyclic = [
      edge("rabbi:a", "taught_by", "rabbi:b"),
      edge("rabbi:b", "taught_by", "rabbi:a"),
    ];
    const hits = walk(cyclic, ref("rabbi:a"), { maxDepth: 10 });
    expect(hits.map((h) => h.node.id)).toEqual(["b"]);
  });

  it("terminates on a longer cycle", () => {
    const cyclic = [
      edge("book:a", "quotes", "book:b"),
      edge("book:b", "quotes", "book:c"),
      edge("book:c", "quotes", "book:a"),
    ];
    const hits = walk(cyclic, ref("book:a"), { maxDepth: 25 });
    expect(hits.map((h) => h.node.id)).toEqual(["b", "c"]);
  });

  it("tolerates a self-loop", () => {
    const hits = walk([edge("book:a", "related_to", "book:a")], ref("book:a"), { maxDepth: 5 });
    expect(hits).toEqual([]);
  });

  it("reaches a node by its shortest route when several exist", () => {
    // a → c directly, and a → b → c. Depth 1 must win.
    const diamond = [
      edge("book:a", "quotes", "book:c"),
      edge("book:a", "quotes", "book:b"),
      edge("book:b", "quotes", "book:c"),
    ];
    const hit = walk(diamond, ref("book:a"), { maxDepth: 4 }).find((h) => h.node.id === "c");
    expect(hit?.depth).toBe(1);
  });

  it("returns nothing from an isolated node", () => {
    expect(walk(edges, ref("book:unconnected"))).toEqual([]);
  });

  it("handles an empty edge list", () => {
    expect(walk([], ref("book:a"))).toEqual([]);
  });
});

describe("neighbours", () => {
  it("returns only one hop", () => {
    const edges = [
      edge("book:mb", "authored_by", "rabbi:cc"),
      edge("rabbi:cc", "taught_by", "rabbi:t"),
    ];
    expect(neighbours(edges, ref("book:mb")).map((h) => h.node.id)).toEqual(["cc"]);
  });
});

describe("teacherLineage / studentLineage", () => {
  const chain = [
    edge("rabbi:student", "taught_by", "rabbi:rebbe"),
    edge("rabbi:rebbe", "taught_by", "rabbi:elder"),
    // Noise that must not appear in a lineage.
    edge("book:sefer", "authored_by", "rabbi:rebbe"),
  ];

  it("walks teachers, shallowest first", () => {
    const line = teacherLineage(chain, ref("rabbi:student"));
    expect(line.map((h) => h.node.id)).toEqual(["rebbe", "elder"]);
    expect(line.map((h) => h.depth)).toEqual([1, 2]);
  });

  it("ignores relations that are not taught_by", () => {
    const line = teacherLineage(chain, ref("rabbi:rebbe"));
    expect(line.map((h) => h.node.id)).toEqual(["elder"]);
  });

  it("walks students by following taught_by backwards", () => {
    const line = studentLineage(chain, ref("rabbi:elder"));
    expect(line.map((h) => h.node.id)).toEqual(["rebbe", "student"]);
  });
});

describe("subgraphAround", () => {
  const edges = [
    edge("lesson:1", "quotes", "book:mb"),
    edge("book:mb", "authored_by", "rabbi:cc"),
    edge("book:far", "authored_by", "rabbi:other"),
  ];

  it("includes the start node itself", () => {
    const graph = subgraphAround(edges, ref("lesson:1"), { maxDepth: 1 });
    expect(graph.nodes.map(nodeKey)).toContain("lesson:1");
  });

  it("excludes nodes beyond the depth limit", () => {
    const graph = subgraphAround(edges, ref("lesson:1"), { maxDepth: 1 });
    expect(graph.nodes.map(nodeKey)).not.toContain("rabbi:cc");
  });

  it("drops edges with an endpoint outside the subgraph", () => {
    const graph = subgraphAround(edges, ref("lesson:1"), { maxDepth: 1 });
    // book:mb → rabbi:cc must not be returned: rabbi:cc was not included,
    // so the line would render into nothing.
    expect(graph.edges.every((e) => e.toId !== "cc")).toBe(true);
  });

  it("includes a whole connected component at sufficient depth", () => {
    const graph = subgraphAround(edges, ref("lesson:1"), { maxDepth: 5 });
    expect(graph.nodes.map(nodeKey).sort()).toEqual(["book:mb", "lesson:1", "rabbi:cc"]);
  });
});

describe("degreeByNode", () => {
  it("counts both endpoints", () => {
    const degrees = degreeByNode([edge("book:a", "quotes", "book:b")]);
    expect(degrees.get("book:a")).toBe(1);
    expect(degrees.get("book:b")).toBe(1);
  });

  it("counts a self-loop once", () => {
    const degrees = degreeByNode([edge("book:a", "related_to", "book:a")]);
    expect(degrees.get("book:a")).toBe(1);
  });
});

describe("shortestPath", () => {
  const edges = [
    edge("lesson:1", "quotes", "book:mb"),
    edge("book:mb", "authored_by", "rabbi:cc"),
  ];

  it("finds a route across relations", () => {
    expect(shortestPath(edges, ref("lesson:1"), ref("rabbi:cc"))).toEqual([
      "lesson:1",
      "book:mb",
      "rabbi:cc",
    ]);
  });

  it("returns a single-node path when both ends are the same", () => {
    expect(shortestPath(edges, ref("book:mb"), ref("book:mb"))).toEqual(["book:mb"]);
  });

  it("returns null when unconnected", () => {
    expect(shortestPath(edges, ref("lesson:1"), ref("book:nowhere"))).toBeNull();
  });
});
