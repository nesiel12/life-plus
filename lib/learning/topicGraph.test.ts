import { describe, expect, it } from "vitest";
import { buildTopicGraph, layoutGraph, stemsOf, termsMatch, tokenize } from "@/lib/learning/topicGraph";
import type { LearningResource, LearningTopic } from "@/types";

const topic = (id: string, title: string, category?: string): LearningTopic => ({
  id, title, category, status: "active", createdAt: "2026-09-01T00:00:00Z",
});
const res = (id: string, topicId: string, title: string, isCompleted = false): LearningResource => ({
  id, topicId, type: "youtube", title, isCompleted, createdAt: "2026-09-01T00:00:00Z",
});

describe("tokenize", () => {
  it("keeps meaningful words, lowercased", () => {
    expect(tokenize("Quantum Physics")).toEqual(["quantum", "physics"]);
  });

  it("drops stopwords, short words and bare numbers", () => {
    expect(tokenize("מבוא ל-Python 3 for the course")).toEqual(["python"]);
  });

  it("recognises a stopword even when it starts with a prefix letter", () => {
    // "מבוא" (introduction) and "שיעור" (lesson) both begin with a prefix letter,
    // and "והשיעור" is the same word with two more in front.
    expect(tokenize("מבוא שיעור כללי פייתון")).toEqual(["פייתון"]);
    expect(tokenize("והשיעור פייתון")).toEqual(["פייתון"]);
  });

  it("ignores niqqud and punctuation, and repeats", () => {
    expect(tokenize("שָׁבָּת, שבת! שבת")).toEqual(["שבת"]);
  });
});

describe("stemsOf / termsMatch", () => {
  it("offers the word and its prefix-free forms, never a stem under four letters", () => {
    expect(stemsOf("הפיזיקה")).toEqual(["הפיזיקה", "פיזיקה"]);
    expect(stemsOf("ובפיזיקה")).toEqual(["ובפיזיקה", "בפיזיקה", "פיזיקה"]);
    expect(stemsOf("בית")).toEqual(["בית"]);
    expect(stemsOf("שלום")).toEqual(["שלום"]);
    expect(stemsOf("כבידה")).toEqual(["כבידה", "בידה"]);
  });

  it("matches a word to its prefixed forms, including a root that starts with a prefix letter", () => {
    expect(termsMatch("פיזיקה", "הפיזיקה")).toBe(true);
    expect(termsMatch("בפיזיקה", "והפיזיקה")).toBe(true);
    expect(termsMatch("כבידה", "וכבידה")).toBe(true);
    expect(termsMatch("מסלולים", "ומסלולים")).toBe(true);
    expect(termsMatch("python", "python")).toBe(true);
  });

  it("does not match different words, or a short root against a longer word that contains it", () => {
    expect(termsMatch("פיזיקה", "כימיה")).toBe(false);
    expect(termsMatch("ידה", "כבידה")).toBe(false);
    expect(termsMatch("שלום", "כלום")).toBe(false);
  });

  it("is symmetric", () => {
    for (const [a, b] of [["כבידה", "וכבידה"], ["פיזיקה", "הפיזיקה"], ["מסלולים", "כימיה"]]) {
      expect(termsMatch(a, b)).toBe(termsMatch(b, a));
    }
  });
});

describe("buildTopicGraph", () => {
  it("connects topics that share a category, and says why", () => {
    const { edges } = buildTopicGraph([topic("a", "אלגברה", "מתמטיקה"), topic("b", "גיאומטריה", "מתמטיקה")], []);
    expect(edges).toHaveLength(1);
    expect(edges[0].reason).toContain("קטגוריה משותפת");
    expect(edges[0].weight).toBeGreaterThanOrEqual(0.5);
  });

  it("connects topics that share real terms, even across categories", () => {
    const topics = [topic("a", "פיזיקה קוונטית", "מדעים"), topic("b", "היסטוריה של פיזיקה קוונטית", "היסטוריה")];
    const { edges } = buildTopicGraph(topics, []);
    expect(edges).toHaveLength(1);
    expect(edges[0].reason).toContain("מושגים משותפים");
    expect(edges[0].reason).toContain("קוונטית");
    expect(edges[0].reason).not.toContain("קטגוריה");
  });

  it("uses resource titles as evidence too", () => {
    const topics = [topic("a", "מכניקה"), topic("b", "אסטרונומיה")];
    const resources = [res("1", "a", "כבידה ומסלולים של כוכבים"), res("2", "b", "מסלולים וכבידה בחלל")];
    expect(buildTopicGraph(topics, resources).edges).toHaveLength(1);
  });

  it("never connects unrelated topics, or one shared stray word", () => {
    const topics = [topic("a", "פייתון למתחילים", "תכנות"), topic("b", "בישול איטלקי", "אוכל"), topic("c", "ציור בצבעי מים", "אמנות")];
    expect(buildTopicGraph(topics, []).edges).toEqual([]);
    // One shared term alone is below the bar.
    expect(buildTopicGraph([topic("x", "פיזיקה"), topic("y", "פיזיקה ואמנות")], []).edges).toEqual([]);
  });

  it("compares categories case- and spacing-insensitively", () => {
    const { edges } = buildTopicGraph([topic("a", "א", " AI "), topic("b", "ב", "ai")], []);
    expect(edges).toHaveLength(1);
  });

  it("caps how many connections a node keeps, so a big category is a web and not a hairball", () => {
    const topics = Array.from({ length: 10 }, (_, i) => topic(`t${i}`, `נושא ${i}`, "אותה קטגוריה"));
    const { edges } = buildTopicGraph(topics, []);
    const all = (10 * 9) / 2;
    expect(edges.length).toBeLessThan(all);
    // No edge is added between two nodes that both already have their share.
    const degree = new Map<string, number>();
    for (const e of edges) {
      degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
      degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
    }
    expect(Math.min(...degree.values())).toBeGreaterThanOrEqual(1);
  });

  it("is deterministic and does not depend on input order for which edges exist", () => {
    const topics = [topic("a", "פיזיקה קוונטית", "מדעים"), topic("b", "כימיה קוונטית", "מדעים"), topic("c", "פייתון", "תכנות")];
    const one = buildTopicGraph(topics, []);
    const two = buildTopicGraph([...topics].reverse(), []);
    const keys = (g: typeof one) => g.edges.map((e) => [e.a, e.b].sort().join("|")).sort();
    expect(keys(one)).toEqual(keys(two));
  });

  it("carries progress and size on the nodes", () => {
    const topics = [topic("a", "אלגברה")];
    const resources = [res("1", "a", "x", true), res("2", "a", "y", false)];
    const [node] = buildTopicGraph(topics, resources).nodes;
    expect(node).toMatchObject({ id: "a", resourceCount: 2, progress: 0.5, complete: false });
  });

  it("handles an empty lab", () => {
    expect(buildTopicGraph([], [])).toEqual({ nodes: [], edges: [] });
  });
});

describe("layoutGraph", () => {
  const sample = () => {
    const topics = [
      topic("a", "פיזיקה קוונטית", "מדעים"), topic("b", "כימיה קוונטית", "מדעים"), topic("c", "אלגברה", "מתמטיקה"),
      topic("d", "גיאומטריה", "מתמטיקה"), topic("e", "פייתון", "תכנות"), topic("f", "ג'אווהסקריפט", "תכנות"),
      topic("g", "ציור", "אמנות"), topic("h", "מוזיקה", "אמנות"),
    ];
    return buildTopicGraph(topics, []);
  };

  it("places every node inside the square", () => {
    const { nodes, edges } = sample();
    for (const node of layoutGraph(nodes, edges)) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x).toBeLessThanOrEqual(100);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeLessThanOrEqual(100);
    }
  });

  it("is deterministic: the same topics always lay out the same way", () => {
    const { nodes, edges } = sample();
    expect(layoutGraph(nodes, edges)).toEqual(layoutGraph(nodes, edges));
    expect(layoutGraph([...nodes].reverse(), edges)).toEqual(layoutGraph(nodes, edges));
  });

  it("keeps nodes apart", () => {
    const { nodes, edges } = sample();
    const placed = layoutGraph(nodes, edges);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        expect(Math.hypot(placed[i].x - placed[j].x, placed[i].y - placed[j].y), `${placed[i].id}/${placed[j].id}`).toBeGreaterThan(8);
      }
    }
  });

  it("puts related topics closer together than unrelated ones", () => {
    const { nodes, edges } = sample();
    const placed = new Map(layoutGraph(nodes, edges).map((n) => [n.id, n]));
    const dist = (a: string, b: string) => Math.hypot(placed.get(a)!.x - placed.get(b)!.x, placed.get(a)!.y - placed.get(b)!.y);
    const connected = new Set(edges.map((e) => [e.a, e.b].sort().join("|")));
    let near = 0, nearN = 0, far = 0, farN = 0;
    const ids = [...placed.keys()];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const d = dist(ids[i], ids[j]);
        if (connected.has([ids[i], ids[j]].sort().join("|"))) { near += d; nearN++; } else { far += d; farN++; }
      }
    }
    expect(nearN).toBeGreaterThan(0);
    expect(near / nearN).toBeLessThan(far / farN);
  });

  it("puts a lone node in the middle and an empty lab nowhere", () => {
    const [only] = layoutGraph([{ id: "x", title: "x", resourceCount: 0, progress: 0, complete: false, x: 0, y: 0 }], []);
    expect([only.x, only.y]).toEqual([50, 50]);
    expect(layoutGraph([], [])).toEqual([]);
  });

  it("stays inside the square and apart even with many topics", () => {
    const topics = Array.from({ length: 30 }, (_, i) => topic(`t${String(i).padStart(2, "0")}`, `נושא ${i}`, `קטגוריה ${i % 4}`));
    const { nodes, edges } = buildTopicGraph(topics, []);
    const placed = layoutGraph(nodes, edges);
    expect(placed).toHaveLength(30);
    for (const p of placed) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(100);
    }
    let minDist = Infinity;
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) minDist = Math.min(minDist, Math.hypot(placed[i].x - placed[j].x, placed[i].y - placed[j].y));
    expect(minDist).toBeGreaterThan(3);
  });
});
