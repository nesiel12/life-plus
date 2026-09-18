// The visual knowledge map — from the learner's library to a renderable graph.
//
// Pure and client-safe. The route (app/api/torah/graph) loads rows and hands
// them here; the canvas filters and searches the result in the browser.
//
// Two sources of edges, merged:
//   1. kg_edges — every relation the graph has recorded (with origin/weight).
//   2. The links the relational tables already hold and never wrote as edges:
//      books.author_rabbi_id, lessons.book_id / rabbi_id, a lesson source
//      matched to a book, a concept mention. Without these the map of a
//      library that has never run an extraction would be a field of dots.
// When both describe the same link, the stronger origin wins (user > import > ai).

import { clip } from "@/lib/torah/havruta";
import { eraLabel, hebrewOnly } from "@/lib/torah/hebrew";
import { normalizeTerm } from "@/lib/torah/normalizeTerm";
import type { KgEdge, KgOrigin, KgRelation } from "@/lib/torah/graph";

export type MapNodeType = "book" | "rabbi" | "lesson" | "concept";

/** How an edge is drawn and filtered — the user's vocabulary, not the table's. */
export type MapEdgeKind = "authored_by" | "cites" | "student_of" | "given_by" | "related_concept";

export type EraBucket = "tannaim" | "amoraim" | "geonim" | "rishonim" | "acharonim" | "modern" | "unknown";

export const ERA_ORDER: EraBucket[] = ["tannaim", "amoraim", "geonim", "rishonim", "acharonim", "modern", "unknown"];

export const ERA_LABELS: Record<EraBucket, string> = {
  tannaim: "תנאים",
  amoraim: "אמוראים",
  geonim: "גאונים",
  rishonim: "ראשונים",
  acharonim: "אחרונים",
  modern: "בני זמננו",
  unknown: "תקופה לא ידועה",
};

export const NODE_TYPE_LABELS: Record<MapNodeType, string> = {
  book: "ספרים",
  rabbi: "רבנים",
  lesson: "שיעורים",
  concept: "מושגים",
};

/** Singular, for the inspector's "ספר" / "רב" line. */
export const NODE_TYPE_SINGULAR: Record<MapNodeType, string> = {
  book: "ספר",
  rabbi: "רב",
  lesson: "שיעור",
  concept: "מושג",
};

export const EDGE_KIND_LABELS: Record<MapEdgeKind, string> = {
  authored_by: "חיבר",
  cites: "מצטט",
  student_of: "תלמיד של",
  given_by: "מסר את השיעור",
  related_concept: "מושג קשור",
};

export interface MapNode {
  /** `type:id` — the same key lib/torah/graph.ts uses. */
  key: string;
  type: MapNodeType;
  id: string;
  label: string;
  /** One quiet line: an author, an era, a date. */
  sublabel?: string;
  era?: EraBucket;
  /** Books only. */
  category?: string;
  href?: string;
  /** A few lines for the inspector's preview — description, bio, lesson summary, definition. */
  preview?: string;
  /** Filled by buildMapGraph from the final edge set. */
  degree: number;
}

export interface MapEdge {
  id: string;
  from: string;
  to: string;
  kind: MapEdgeKind;
  /** The raw kg relation, for the inspector ("מצטט" vs "פירוש על"). */
  relation: KgRelation | "implicit";
  origin: KgOrigin;
  weight: number;
}

export interface MapGraph {
  nodes: MapNode[];
  edges: MapEdge[];
}

// ---------------------------------------------------------------------------
// Input rows — only the columns the map needs, so the route can select narrowly
// ---------------------------------------------------------------------------

export interface MapBookInput {
  id: string;
  title: string;
  hebrewTitle?: string | null;
  author?: string | null;
  category?: string | null;
  authorRabbiId?: string | null;
  description?: string | null;
}

export interface MapRabbiInput {
  id: string;
  name: string;
  hebrewName?: string | null;
  era?: string | null;
  birthYear?: number | null;
  deathYear?: number | null;
  isContemporary?: boolean | null;
  bio?: string | null;
}

export interface MapLessonInput {
  id: string;
  title: string;
  bookId?: string | null;
  rabbiId?: string | null;
  speaker?: string | null;
  status?: string;
  summary?: string | null;
}

export interface MapConceptInput {
  id: string;
  term: string;
  mentionCount?: number;
  definition?: string | null;
}

export interface MapGraphInput {
  books: MapBookInput[];
  rabbis: MapRabbiInput[];
  lessons: MapLessonInput[];
  concepts: MapConceptInput[];
  edges: KgEdge[];
  /** Concept mentions: a lesson/book that discusses a concept. */
  conceptMentions?: { conceptId: string; sourceType: string; sourceId: string }[];
  /** Lesson sources matched to a library book. */
  lessonBookSources?: { lessonId: string; bookId: string }[];
}

const ORIGIN_RANK: Record<KgOrigin, number> = { user: 3, import: 2, ai: 1 };

/** A kg relation in the map's vocabulary, with the direction the map draws it. */
export function edgeKindFor(relation: KgRelation): MapEdgeKind {
  switch (relation) {
    case "authored_by":
      return "authored_by";
    case "taught_by":
      return "student_of";
    case "quotes":
    case "commentary_on":
      return "cites";
    default:
      return "related_concept";
  }
}

/**
 * A rabbi's era, bucketed.
 *
 * The stored `era` wins (a Sefaria code or a Hebrew label); dates are the
 * fallback, by the conventional boundaries: the Mishna's close (~220), the
 * Talmud's (~500), the Geonic period's end (1038), the Shulchan Aruch (1563)
 * as the turn to the Acharonim, and anyone active after 1948 as בני זמננו.
 */
export function eraBucket(rabbi: Pick<MapRabbiInput, "era" | "birthYear" | "deathYear" | "isContemporary">): EraBucket {
  if (rabbi.isContemporary) return "modern";

  const label = normalizeTerm(eraLabel(rabbi.era) ?? rabbi.era ?? "");
  if (label) {
    if (/תנא/.test(label)) return "tannaim";
    if (/אמורא|סבורא/.test(label)) return "amoraim";
    if (/גאונ/.test(label)) return "geonim";
    if (/ראשונ/.test(label)) return "rishonim";
    if (/אחרונ/.test(label)) return "acharonim";
    if (/זמננו|דורנו|מודרנ|בני זמנ|contemporary|modern/.test(label)) return "modern";
    if (/tanna/.test(label)) return "tannaim";
    if (/amora/.test(label)) return "amoraim";
    if (/geon|gaon/.test(label)) return "geonim";
    if (/rishon/.test(label)) return "rishonim";
    if (/acharon|achron/.test(label)) return "acharonim";
  }

  const year = rabbi.deathYear ?? (rabbi.birthYear != null ? rabbi.birthYear + 60 : null);
  if (year == null) return "unknown";
  if (year <= 220) return "tannaim";
  if (year <= 500) return "amoraim";
  if (year <= 1038) return "geonim";
  if (year <= 1563) return "rishonim";
  if (year <= 1948) return "acharonim";
  return "modern";
}

/** Builds the full map. Dangling edges (an endpoint not in the library) are dropped. */
export function buildMapGraph(input: MapGraphInput): MapGraph {
  const nodes = new Map<string, MapNode>();
  const rabbiEra = new Map<string, EraBucket>();
  const rabbiName = new Map<string, string>();

  for (const r of input.rabbis) {
    const era = eraBucket(r);
    const label = r.hebrewName?.trim() || r.name;
    rabbiEra.set(r.id, era);
    rabbiName.set(r.id, label);
    nodes.set(`rabbi:${r.id}`, {
      key: `rabbi:${r.id}`,
      type: "rabbi",
      id: r.id,
      label,
      sublabel: era === "unknown" ? undefined : ERA_LABELS[era],
      era,
      href: `/areas/torah/rabbis/${r.id}`,
      preview: previewText(r.bio),
      degree: 0,
    });
  }

  for (const b of input.books) {
    const era = b.authorRabbiId ? rabbiEra.get(b.authorRabbiId) : undefined;
    const author = (b.authorRabbiId && rabbiName.get(b.authorRabbiId)) || b.author?.trim() || undefined;
    nodes.set(`book:${b.id}`, {
      key: `book:${b.id}`,
      type: "book",
      id: b.id,
      label: b.hebrewTitle?.trim() || b.title,
      sublabel: author,
      era: era ?? "unknown",
      category: b.category?.trim() || undefined,
      href: `/areas/torah/books/${b.id}`,
      preview: previewText(b.description),
      degree: 0,
    });
  }

  for (const l of input.lessons) {
    nodes.set(`lesson:${l.id}`, {
      key: `lesson:${l.id}`,
      type: "lesson",
      id: l.id,
      label: l.title,
      sublabel: l.speaker?.trim() || (l.rabbiId ? rabbiName.get(l.rabbiId) : undefined),
      href: `/areas/torah/lessons/${l.id}`,
      preview: previewText(l.summary),
      degree: 0,
    });
  }

  for (const c of input.concepts) {
    nodes.set(`concept:${c.id}`, {
      key: `concept:${c.id}`,
      type: "concept",
      id: c.id,
      label: c.term,
      sublabel: c.mentionCount ? `${c.mentionCount} אזכורים` : undefined,
      preview: previewText(c.definition),
      degree: 0,
    });
  }

  const edges = new Map<string, MapEdge>();
  const add = (edge: Omit<MapEdge, "id">) => {
    if (!nodes.has(edge.from) || !nodes.has(edge.to) || edge.from === edge.to) return;
    const id = `${edge.from}>${edge.kind}>${edge.to}`;
    const existing = edges.get(id);
    if (
      !existing ||
      ORIGIN_RANK[edge.origin] > ORIGIN_RANK[existing.origin] ||
      (ORIGIN_RANK[edge.origin] === ORIGIN_RANK[existing.origin] && edge.weight > existing.weight)
    ) {
      edges.set(id, { ...edge, id });
    }
  };

  for (const e of input.edges) {
    // A `topic` endpoint is a free-text label; on the map it is a concept only
    // when the glossary has it, so topic edges are resolved by concept term.
    const from = resolveEndpoint(e.fromType, e.fromId, input.concepts);
    const to = resolveEndpoint(e.toType, e.toId, input.concepts);
    if (!from || !to) continue;
    add({ from, to, kind: edgeKindFor(e.relation), relation: e.relation, origin: e.origin, weight: e.weight });
  }

  for (const b of input.books) {
    if (b.authorRabbiId) {
      add({ from: `book:${b.id}`, to: `rabbi:${b.authorRabbiId}`, kind: "authored_by", relation: "implicit", origin: "user", weight: 1 });
    }
  }
  for (const l of input.lessons) {
    if (l.bookId) add({ from: `lesson:${l.id}`, to: `book:${l.bookId}`, kind: "cites", relation: "implicit", origin: "user", weight: 1 });
    if (l.rabbiId) add({ from: `lesson:${l.id}`, to: `rabbi:${l.rabbiId}`, kind: "given_by", relation: "implicit", origin: "user", weight: 1 });
  }
  for (const s of input.lessonBookSources ?? []) {
    add({ from: `lesson:${s.lessonId}`, to: `book:${s.bookId}`, kind: "cites", relation: "implicit", origin: "ai", weight: 0.8 });
  }
  for (const m of input.conceptMentions ?? []) {
    if (m.sourceType !== "lesson" && m.sourceType !== "book") continue;
    add({ from: `${m.sourceType}:${m.sourceId}`, to: `concept:${m.conceptId}`, kind: "related_concept", relation: "implicit", origin: "ai", weight: 0.7 });
  }

  return withDegrees({ nodes: [...nodes.values()], edges: [...edges.values()] });
}

const PREVIEW_CHARS = 320;

/** Hebrew preview text only — the map never shows an English blurb. */
function previewText(value: string | null | undefined): string | undefined {
  const hebrew = hebrewOnly(value);
  return hebrew ? clip(hebrew, PREVIEW_CHARS) : undefined;
}

function resolveEndpoint(type: string, id: string, concepts: MapConceptInput[]): string | null {
  if (type === "book" || type === "rabbi" || type === "lesson" || type === "concept") return `${type}:${id}`;
  if (type === "topic") {
    const key = normalizeTerm(id);
    const match = concepts.find((c) => normalizeTerm(c.term) === key);
    return match ? `concept:${match.id}` : null;
  }
  return null;
}

function withDegrees(graph: MapGraph): MapGraph {
  const degree = new Map<string, number>();
  for (const e of graph.edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }
  return {
    nodes: graph.nodes.map((n) => ({ ...n, degree: degree.get(n.key) ?? 0 })),
    edges: graph.edges,
  };
}

// ---------------------------------------------------------------------------
// Filtering, search, caps — run in the browser on every control change
// ---------------------------------------------------------------------------

export interface MapFilters {
  /** Visible node types. Empty = all. */
  types?: ReadonlySet<MapNodeType>;
  /** Visible eras — applies to rabbis and books. Empty = all. */
  eras?: ReadonlySet<EraBucket>;
  /** Visible book categories. Empty = all. "" stands for "uncategorised". */
  categories?: ReadonlySet<string>;
  /** Visible edge kinds. Empty = all. */
  edgeKinds?: ReadonlySet<MapEdgeKind>;
  /** Hide nodes left with no visible edge. */
  hideIsolated?: boolean;
}

/**
 * The visible subgraph.
 *
 * Era and category filter the nodes that *have* those properties; a lesson or
 * a concept has no era, so it stays unless it is left isolated — hiding every
 * lesson the moment an era is chosen would make the filter useless.
 */
export function filterMapGraph(graph: MapGraph, filters: MapFilters): MapGraph {
  const types = filters.types?.size ? filters.types : null;
  const eras = filters.eras?.size ? filters.eras : null;
  const categories = filters.categories?.size ? filters.categories : null;
  const kinds = filters.edgeKinds?.size ? filters.edgeKinds : null;
  const eraOrCategoryActive = Boolean(eras || categories);

  const kept = new Map<string, MapNode>();
  for (const node of graph.nodes) {
    if (types && !types.has(node.type)) continue;
    if (eras && (node.type === "rabbi" || node.type === "book") && !eras.has(node.era ?? "unknown")) continue;
    if (categories && node.type === "book" && !categories.has(node.category ?? "")) continue;
    kept.set(node.key, node);
  }

  let edges = graph.edges.filter((e) => kept.has(e.from) && kept.has(e.to) && (!kinds || kinds.has(e.kind)));

  if (eraOrCategoryActive) {
    // Lessons and concepts have no era or category of their own. They stay
    // when reachable from a rabbi or book that passed the filter — through
    // other lessons/concepts too, but never kept alive by each other alone.
    const reachable = new Set<string>();
    const queue: string[] = [];
    for (const node of kept.values()) {
      if (node.type === "rabbi" || node.type === "book") {
        reachable.add(node.key);
        queue.push(node.key);
      }
    }
    const adjacent = new Map<string, string[]>();
    for (const e of edges) {
      (adjacent.get(e.from) ?? adjacent.set(e.from, []).get(e.from)!).push(e.to);
      (adjacent.get(e.to) ?? adjacent.set(e.to, []).get(e.to)!).push(e.from);
    }
    while (queue.length) {
      for (const next of adjacent.get(queue.shift()!) ?? []) {
        if (reachable.has(next)) continue;
        reachable.add(next);
        queue.push(next);
      }
    }
    for (const key of [...kept.keys()]) if (!reachable.has(key)) kept.delete(key);
    edges = edges.filter((e) => kept.has(e.from) && kept.has(e.to));
  }

  const connected = new Set<string>();
  for (const e of edges) {
    connected.add(e.from);
    connected.add(e.to);
  }

  const nodes = [...kept.values()].filter((node) => {
    if (connected.has(node.key)) return true;
    if (filters.hideIsolated) return false;
    if (eraOrCategoryActive && (node.type === "lesson" || node.type === "concept")) return false;
    return true;
  });

  return withDegrees({ nodes, edges });
}

/**
 * The most connected nodes, when a library outgrows a comfortable canvas.
 *
 * A force layout of thousands of nodes on the main thread is a frozen tab
 * (docs/TORAH_KG_PLAN.md, Phase 7). Ties break by label so the cut is stable.
 */
export function capMapGraph(graph: MapGraph, maxNodes: number): { graph: MapGraph; hidden: number } {
  if (graph.nodes.length <= maxNodes) return { graph, hidden: 0 };
  const keep = new Set(
    [...graph.nodes]
      .sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label, "he"))
      .slice(0, maxNodes)
      .map((n) => n.key)
  );
  const nodes = graph.nodes.filter((n) => keep.has(n.key));
  const edges = graph.edges.filter((e) => keep.has(e.from) && keep.has(e.to));
  return { graph: withDegrees({ nodes, edges }), hidden: graph.nodes.length - nodes.length };
}

/** The book categories present, for the filter chips. "" = uncategorised. */
export function mapCategories(graph: MapGraph): string[] {
  const set = new Set<string>();
  for (const n of graph.nodes) if (n.type === "book") set.add(n.category ?? "");
  return [...set].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, "he")));
}

/** The eras present among rabbis and books, in historical order. */
export function mapEras(graph: MapGraph): EraBucket[] {
  const set = new Set<EraBucket>();
  for (const n of graph.nodes) if (n.type === "rabbi" || n.type === "book") set.add(n.era ?? "unknown");
  return ERA_ORDER.filter((era) => set.has(era));
}

/** Folded for search: no niqqud or gershayim, and the rabbinic honorifics gone. */
function searchKey(text: string): string {
  return normalizeTerm(text).replace(/^(הרב|רבי|רבנו|רבינו|מרן|הגאון) /, "");
}

/**
 * Nodes matching a typed query, best first: exact, then prefix, then a word
 * prefix, then anywhere. Connected nodes break ties — the one the learner
 * means is usually the one at the centre of things.
 */
export function searchMapNodes(nodes: readonly MapNode[], query: string, limit = 8): MapNode[] {
  const q = searchKey(query);
  if (!q) return [];
  const ranked: { node: MapNode; rank: number }[] = [];
  for (const node of nodes) {
    const label = searchKey(node.label);
    let rank = -1;
    if (label === q) rank = 0;
    else if (label.startsWith(q)) rank = 1;
    else if (label.split(" ").some((w) => w.startsWith(q))) rank = 2;
    else if (label.includes(q)) rank = 3;
    else if (node.sublabel && searchKey(node.sublabel).includes(q)) rank = 4;
    if (rank >= 0) ranked.push({ node, rank });
  }
  return ranked
    .sort((a, b) => a.rank - b.rank || b.node.degree - a.node.degree || a.node.label.localeCompare(b.node.label, "he"))
    .slice(0, limit)
    .map((r) => r.node);
}

/** A node's neighbours with the edge that connects them, for the inspector. */
export function nodeConnections(graph: MapGraph, key: string): { node: MapNode; edge: MapEdge; outgoing: boolean }[] {
  const byKey = new Map(graph.nodes.map((n) => [n.key, n]));
  const out: { node: MapNode; edge: MapEdge; outgoing: boolean }[] = [];
  for (const edge of graph.edges) {
    if (edge.from === key && byKey.has(edge.to)) out.push({ node: byKey.get(edge.to)!, edge, outgoing: true });
    else if (edge.to === key && byKey.has(edge.from)) out.push({ node: byKey.get(edge.from)!, edge, outgoing: false });
  }
  return out.sort((a, b) => b.edge.weight - a.edge.weight || a.node.label.localeCompare(b.node.label, "he"));
}

/**
 * How an edge reads from the inspected node's side.
 *
 * Edges are directional ("book authored_by rabbi"); on the rabbi's inspector
 * the same edge must read "חיבר את", not "חיבר".
 */
export function connectionLabel(kind: MapEdgeKind, outgoing: boolean): string {
  if (outgoing) {
    return { authored_by: "נכתב על ידי", cites: "מצטט את", student_of: "תלמיד של", given_by: "נמסר על ידי", related_concept: "עוסק ב" }[kind];
  }
  return { authored_by: "חיבר את", cites: "מצוטט ב", student_of: "רבו של", given_by: "מסר את", related_concept: "נזכר ב" }[kind];
}
