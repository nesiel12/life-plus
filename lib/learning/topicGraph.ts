import { topicProgress } from "@/lib/learning/xp";
import { normalizeText } from "@/lib/learning/topicSearch";
import type { LearningResource, LearningTopic } from "@/types";

// The knowledge map: which topics are actually related, and where to draw them.
//
// Edges are never invented. Two topics are connected only when they share a
// category or share real terms in their titles and resource titles, and every
// edge carries the reason it exists — shown on hover — so the map is something
// a person can check, not decoration. (Same rule as lib/context's
// relatedKnowledge: "a real keyword overlap".)

const STOPWORDS = new Set([
  // Hebrew: particles, and words that describe *being a course* rather than its subject.
  "של", "על", "עם", "את", "אל", "זה", "זו", "הוא", "היא", "כל", "גם", "או", "אבל", "כי", "אם", "מה", "איך", "למה",
  "מן", "מתוך", "בין", "לפי", "נושא", "קורס", "מבוא", "שיעור", "סרטון", "מאמר", "פרק", "חלק", "כללי", "בסיסי",
  // English
  "the", "and", "for", "with", "how", "what", "why", "from", "into", "intro", "introduction", "course", "basics",
  "lesson", "video", "part", "guide", "learn", "learning", "tutorial",
]);

const HEBREW_PREFIXES = new Set(["ה", "ו", "ב", "ל", "מ", "ש", "כ"]);

/** A stem shorter than this is too likely to be a coincidence to match on. */
const MIN_STEM_LENGTH = 4;

/**
 * Every form a word might be *meant* as once Hebrew prefixes are set aside: the
 * word itself, and the word with one or two leading prefix letters removed
 * (ו־, ה־, ב־, ל־, מ־, ש־, כ־), keeping only stems of at least four letters.
 *
 * A single canonical stem cannot work: "כבידה" (gravity) has a root that starts
 * with prefix-like letters, so trimming greedily turns the bare word into "ידה"
 * and "וכבידה" into "בידה", and they never meet. Instead two words are related
 * when *any* of their stems coincide (see termsMatch): "כבידה" and "וכבידה" share
 * "כבידה", "הפיזיקה" and "פיזיקה" share "פיזיקה", and a short root can't
 * create an accidental match because it is never a stem at all.
 */
export function stemsOf(word: string): string[] {
  const stems = [word];
  let current = word;
  for (let i = 0; i < 2 && HEBREW_PREFIXES.has(current[0] ?? ""); i++) {
    current = current.slice(1);
    if (current.length < MIN_STEM_LENGTH) break;
    stems.push(current);
  }
  return stems;
}

/** Whether two words are the same word, allowing for Hebrew prefixes. */
export function termsMatch(a: string, b: string): boolean {
  const other = new Set(stemsOf(b));
  return stemsOf(a).some((stem) => other.has(stem));
}

/**
 * The meaningful words in a piece of text: lowercased, niqqud-free, with
 * stopwords, bare numbers and anything under three letters removed. A word is a
 * stopword if it, or any of its stems, is one — the words that describe *being
 * a course* ("מבוא", "שיעור") begin with prefix letters too, so "והשיעור" goes.
 */
export function tokenize(text: string): string[] {
  const out = new Set<string>();
  for (const word of normalizeText(text).split(" ")) {
    if (word.length < 3 || /^\d+$/.test(word)) continue;
    if (stemsOf(word).some((stem) => STOPWORDS.has(stem))) continue;
    out.add(word);
  }
  return [...out];
}

export interface GraphNode {
  id: string;
  title: string;
  category?: string;
  /** Resources in the topic — sizes the node. */
  resourceCount: number;
  /** 0..1 */
  progress: number;
  complete: boolean;
  /** Position within a 0–100 square. Set by layoutGraph. */
  x: number;
  y: number;
}

export interface GraphEdge {
  a: string;
  b: string;
  /** 0..1 — how strongly related. */
  weight: number;
  /** Why they are connected, in Hebrew, for the hover label. */
  reason: string;
}

const CATEGORY_WEIGHT = 0.5;
const PER_SHARED_TERM = 0.15;
const MAX_TERM_WEIGHT = 0.5;
const MIN_EDGE_WEIGHT = 0.3;
/** Each node keeps its strongest few connections, so a big category is a web, not a hairball. */
const MAX_EDGES_PER_NODE = 3;

interface Signal {
  id: string;
  category: string | null;
  terms: string[];
}

function signalOf(topic: LearningTopic, resources: readonly LearningResource[]): Signal {
  const terms = new Set(tokenize(topic.title));
  for (const r of resources) if (r.topicId === topic.id) for (const t of tokenize(r.title)) terms.add(t);
  const category = topic.category ? normalizeText(topic.category) : "";
  return { id: topic.id, category: category || null, terms: [...terms].sort() };
}

function relate(a: Signal, b: Signal, categoryLabel: string | undefined): Omit<GraphEdge, "a" | "b"> | null {
  const sameCategory = a.category !== null && a.category === b.category;
  // Counted from both sides and the smaller taken, so the relation is the same
  // whichever topic is called "a" (two words in one title can both match a
  // single word in the other).
  const fromA = a.terms.filter((t) => b.terms.some((u) => termsMatch(t, u)));
  const fromB = b.terms.filter((t) => a.terms.some((u) => termsMatch(t, u)));
  const shared = (fromA.length <= fromB.length ? fromA : fromB).slice().sort();

  const weight = Math.min(
    1,
    (sameCategory ? CATEGORY_WEIGHT : 0) + Math.min(MAX_TERM_WEIGHT, shared.length * PER_SHARED_TERM)
  );
  if (weight < MIN_EDGE_WEIGHT) return null;

  const reasons: string[] = [];
  if (sameCategory) reasons.push(`קטגוריה משותפת: ${categoryLabel}`);
  if (shared.length > 0) reasons.push(`מושגים משותפים: ${shared.slice(0, 3).join(", ")}`);
  return { weight: Math.round(weight * 100) / 100, reason: reasons.join(" · ") };
}

const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** The related-topics graph, before layout (x/y are 50,50 until layoutGraph runs). */
export function buildTopicGraph(
  topics: readonly LearningTopic[],
  resources: readonly LearningResource[]
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = topics.map((t) => {
    const own = resources.filter((r) => r.topicId === t.id);
    const progress = topicProgress(own);
    return {
      id: t.id,
      title: t.title,
      category: t.category,
      resourceCount: own.length,
      progress: progress.fraction,
      complete: progress.complete,
      x: 50,
      y: 50,
    };
  });

  const signals = topics.map((t) => signalOf(t, resources));
  const candidates: GraphEdge[] = [];
  for (let i = 0; i < topics.length; i++) {
    for (let j = i + 1; j < topics.length; j++) {
      const related = relate(signals[i], signals[j], topics[i].category);
      if (related) candidates.push({ a: topics[i].id, b: topics[j].id, ...related });
    }
  }

  // Keep an edge if it is among the strongest few for either end. Ties break on
  // the ids, so the same topics always give the same map.
  const strongest = [...candidates].sort((x, y) => y.weight - x.weight || edgeKey(x.a, x.b).localeCompare(edgeKey(y.a, y.b)));
  const degree = new Map<string, number>();
  const kept = new Set<string>();
  for (const edge of strongest) {
    if ((degree.get(edge.a) ?? 0) < MAX_EDGES_PER_NODE || (degree.get(edge.b) ?? 0) < MAX_EDGES_PER_NODE) {
      kept.add(edgeKey(edge.a, edge.b));
      degree.set(edge.a, (degree.get(edge.a) ?? 0) + 1);
      degree.set(edge.b, (degree.get(edge.b) ?? 0) + 1);
    }
  }

  return { nodes, edges: strongest.filter((e) => kept.has(edgeKey(e.a, e.b))) };
}

const PADDING = 9;
const ITERATIONS = 140;

/**
 * Places nodes in a 0–100 square with a small force simulation: every pair
 * pushes apart, connected pairs pull together in proportion to how related they
 * are, and a weak pull toward the middle keeps the map from drifting.
 *
 * No randomness anywhere — nodes start on a circle in a fixed order (by
 * category, then id) and the steps are fixed — so a given set of topics always
 * lays out the same way, and the map does not reshuffle on every visit.
 */
export function layoutGraph(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): GraphNode[] {
  const n = nodes.length;
  if (n === 0) return [];
  if (n === 1) return [{ ...nodes[0], x: 50, y: 50 }];

  const ordered = [...nodes].sort(
    (a, b) => (a.category ?? "").localeCompare(b.category ?? "") || a.id.localeCompare(b.id)
  );
  type Point = { x: number; y: number };
  const pos = new Map<string, Point>(
    ordered.map((node, i) => {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2;
      return [node.id, { x: 50 + 34 * Math.cos(angle), y: 50 + 34 * Math.sin(angle) }];
    })
  );

  // Ideal spacing shrinks as nodes multiply, so 30 topics still fit the square.
  const k = Math.min(30, ((100 - 2 * PADDING) * 0.9) / Math.sqrt(n));

  for (let step = 0; step < ITERATIONS; step++) {
    const cooling = 1 - step / ITERATIONS;
    const force = new Map<string, Point>(ordered.map((node) => [node.id, { x: 0, y: 0 }]));

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = pos.get(ordered[i].id)!;
        const b = pos.get(ordered[j].id)!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.hypot(dx, dy);
        if (dist < 0.01) {
          // Identical positions cannot happen from the circle, but stay total.
          dx = 0.01;
          dy = 0;
          dist = 0.01;
        }
        const push = (k * k) / dist;
        const fa = force.get(ordered[i].id)!;
        const fb = force.get(ordered[j].id)!;
        fa.x += (dx / dist) * push;
        fa.y += (dy / dist) * push;
        fb.x -= (dx / dist) * push;
        fb.y -= (dy / dist) * push;
      }
    }

    for (const edge of edges) {
      const a = pos.get(edge.a);
      const b = pos.get(edge.b);
      if (!a || !b) continue;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.max(0.01, Math.hypot(dx, dy));
      const pull = ((dist * dist) / k) * (0.4 + edge.weight);
      const fa = force.get(edge.a)!;
      const fb = force.get(edge.b)!;
      fa.x -= (dx / dist) * pull;
      fa.y -= (dy / dist) * pull;
      fb.x += (dx / dist) * pull;
      fb.y += (dy / dist) * pull;
    }

    for (const node of ordered) {
      const p = pos.get(node.id)!;
      const f = force.get(node.id)!;
      f.x += (50 - p.x) * 0.9;
      f.y += (50 - p.y) * 0.9;
      const magnitude = Math.max(0.01, Math.hypot(f.x, f.y));
      const move = Math.min(magnitude, 4 * cooling + 0.2);
      p.x = Math.min(100 - PADDING, Math.max(PADDING, p.x + (f.x / magnitude) * move));
      p.y = Math.min(100 - PADDING, Math.max(PADDING, p.y + (f.y / magnitude) * move));
    }
  }

  const placed = new Map(nodes.map((node) => [node.id, node] as const));
  return ordered.map((o) => {
    const p = pos.get(o.id)!;
    return { ...placed.get(o.id)!, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
  });
}
