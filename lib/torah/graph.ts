// The Torah knowledge graph, as pure data.
//
// Every traversal the app performs — a rabbi's chain of transmission, the
// books a shiur cited, the subgraph behind the visual map — is expressed
// here over a plain edge list, with no database and no React. That is
// deliberate: graph bugs are cycle bugs and depth bugs, and those are only
// cheap to find when the traversal can be tested against a hand-written
// array (see graph.test.ts).
//
// The database has its own recursive walk (kg_walk, in
// 20260916000000_torah_kg_core.sql) for deep queries that must not ship the
// whole graph over the wire. The two are not redundant: this module answers
// questions about an edge set already in memory — which is the normal case,
// because one user's Torah graph is hundreds of edges, not millions.

/** Everything that can be a node. Mirrors kg_edges' *_type columns. */
export type KgNodeType =
  | "book"
  | "rabbi"
  | "lesson"
  | "summary"
  | "concept"
  | "person"
  | "topic"
  | "section";

/** Mirrors the `relation` check constraint on kg_edges. */
export type KgRelation =
  | "authored_by"
  | "taught_by"
  | "quotes"
  | "mentions"
  | "about"
  | "part_of"
  | "commentary_on"
  | "discusses"
  | "related_to";

export type KgOrigin = "user" | "ai" | "import";

export interface KgNodeRef {
  type: KgNodeType;
  id: string;
}

export interface KgEdge {
  id: string;
  fromType: KgNodeType;
  fromId: string;
  toType: KgNodeType;
  toId: string;
  relation: KgRelation;
  /** 0..1 confidence. User-asserted edges are 1. */
  weight: number;
  origin: KgOrigin;
  evidence?: Record<string, unknown>;
}

/** Which way an edge is being followed. */
export type KgDirection = "out" | "in" | "both";

export interface WalkOptions {
  /** Restrict to these relations. Omitted means every relation. */
  relations?: KgRelation[];
  /** How many hops out from the start. Defaults to 3. */
  maxDepth?: number;
  direction?: KgDirection;
  /**
   * Drop edges the model was unsure about.
   *
   * Defaults to 0 — every edge. A caller rendering a confident claim (a
   * lineage, a citation the UI presents as fact) should raise this, because
   * an AI edge at weight 0.3 is a guess and walking through it produces a
   * chain that looks authoritative and is not.
   */
  minWeight?: number;
}

/**
 * A node reached by a walk, with the route that got there.
 *
 * `path` is the full chain of node keys from the start, which is what makes
 * a result explainable ("via the Mishna Berura, which cites…") rather than
 * a bare list of everything within three hops.
 */
export interface WalkHit {
  node: KgNodeRef;
  depth: number;
  /** The relation of the final edge into this node. */
  relation: KgRelation;
  /** Weight of the final edge in. */
  weight: number;
  origin: KgOrigin;
  /** Node keys, starting at the origin node and ending at this one. */
  path: string[];
}

const DEFAULT_MAX_DEPTH = 3;

/**
 * The canonical string form of a node reference.
 *
 * Used as the identity key everywhere — visited sets, adjacency maps, the
 * `path` array. `type:id` and not JSON, because it has to be cheap to
 * compare and readable in a failing test's diff.
 */
export function nodeKey(ref: KgNodeRef): string {
  return `${ref.type}:${ref.id}`;
}

export function parseNodeKey(key: string): KgNodeRef {
  // Split on the FIRST colon only. A uuid never contains one, but a `topic`
  // node's id is its label (see the migration), and a user is perfectly
  // entitled to write a topic containing a colon.
  const separator = key.indexOf(":");
  return {
    type: key.slice(0, separator) as KgNodeType,
    id: key.slice(separator + 1),
  };
}

export function sameNode(a: KgNodeRef, b: KgNodeRef): boolean {
  return a.type === b.type && a.id === b.id;
}

export function edgeFrom(edge: KgEdge): KgNodeRef {
  return { type: edge.fromType, id: edge.fromId };
}

export function edgeTo(edge: KgEdge): KgNodeRef {
  return { type: edge.toType, id: edge.toId };
}

interface Adjacency {
  /** nodeKey → edges leaving that node. */
  out: Map<string, KgEdge[]>;
  /** nodeKey → edges arriving at that node. */
  in: Map<string, KgEdge[]>;
}

/**
 * Indexes an edge list for traversal.
 *
 * Built once per walk rather than per hop: a naive traversal that filters
 * the whole edge array at every step is O(nodes × edges), which is fine for
 * ten edges and visibly slow on the graph screen at a thousand.
 */
export function buildAdjacency(edges: KgEdge[]): Adjacency {
  const out = new Map<string, KgEdge[]>();
  const incoming = new Map<string, KgEdge[]>();

  for (const edge of edges) {
    const fromKey = nodeKey(edgeFrom(edge));
    const toKey = nodeKey(edgeTo(edge));

    const outList = out.get(fromKey);
    if (outList) outList.push(edge);
    else out.set(fromKey, [edge]);

    const inList = incoming.get(toKey);
    if (inList) inList.push(edge);
    else incoming.set(toKey, [edge]);
  }

  return { out, in: incoming };
}

function stepsFrom(adjacency: Adjacency, key: string, direction: KgDirection): { edge: KgEdge; next: KgNodeRef }[] {
  const steps: { edge: KgEdge; next: KgNodeRef }[] = [];

  if (direction === "out" || direction === "both") {
    for (const edge of adjacency.out.get(key) ?? []) {
      steps.push({ edge, next: edgeTo(edge) });
    }
  }
  if (direction === "in" || direction === "both") {
    for (const edge of adjacency.in.get(key) ?? []) {
      steps.push({ edge, next: edgeFrom(edge) });
    }
  }

  return steps;
}

/**
 * Breadth-first walk out from a node.
 *
 * Breadth-first, not depth-first, because depth is the thing callers care
 * about: "everything two hops away" has to arrive before anything three hops
 * away, and the first route found to a node should be the shortest one.
 *
 * CYCLE SAFETY. Real Torah data has cycles — two rabbis each recorded as the
 * other's teacher, a sefer and its commentary citing each other. `visited`
 * is global to the walk rather than per-path: a node is expanded once, at
 * the shallowest depth it was reached. That both terminates and gives the
 * shortest path, where a per-path visited set would terminate but re-expand
 * the same node once per route into it and blow up combinatorially on a
 * dense graph.
 */
export function walk(edges: KgEdge[], start: KgNodeRef, options: WalkOptions = {}): WalkHit[] {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const direction = options.direction ?? "out";
  const minWeight = options.minWeight ?? 0;
  const allowed = options.relations ? new Set(options.relations) : null;

  if (maxDepth <= 0) return [];

  const adjacency = buildAdjacency(edges);
  const startKey = nodeKey(start);

  const visited = new Set<string>([startKey]);
  const hits: WalkHit[] = [];

  let frontier: { key: string; path: string[] }[] = [{ key: startKey, path: [startKey] }];

  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
    const next: { key: string; path: string[] }[] = [];

    for (const current of frontier) {
      for (const { edge, next: neighbour } of stepsFrom(adjacency, current.key, direction)) {
        if (allowed && !allowed.has(edge.relation)) continue;
        if (edge.weight < minWeight) continue;

        const neighbourKey = nodeKey(neighbour);
        if (visited.has(neighbourKey)) continue;
        visited.add(neighbourKey);

        const path = [...current.path, neighbourKey];
        hits.push({
          node: neighbour,
          depth,
          relation: edge.relation,
          weight: edge.weight,
          origin: edge.origin,
          path,
        });
        next.push({ key: neighbourKey, path });
      }
    }

    frontier = next;
  }

  return hits;
}

/** Immediate neighbours only — one hop, in either direction. */
export function neighbours(
  edges: KgEdge[],
  node: KgNodeRef,
  options: Omit<WalkOptions, "maxDepth"> = {}
): WalkHit[] {
  return walk(edges, node, { ...options, maxDepth: 1 });
}

/**
 * A rabbi's chain of transmission, teacher by teacher.
 *
 * This is the recursive relationship the feature brief calls out by name,
 * and it is why `taught_by` is an edge rather than a `teacher_id` column: the
 * question is never "who taught him" but "and who taught *them*", to the end
 * of what the user knows.
 *
 * Returns shallowest first, so the array reads forward in time from the
 * rabbi toward their earliest recorded teacher.
 */
export function teacherLineage(edges: KgEdge[], rabbi: KgNodeRef, maxDepth = 6): WalkHit[] {
  return walk(edges, rabbi, {
    relations: ["taught_by"],
    direction: "out",
    maxDepth,
  }).sort((a, b) => a.depth - b.depth);
}

/** Everyone who learned from this rabbi — the same edge, followed backwards. */
export function studentLineage(edges: KgEdge[], rabbi: KgNodeRef, maxDepth = 6): WalkHit[] {
  return walk(edges, rabbi, {
    relations: ["taught_by"],
    direction: "in",
    maxDepth,
  }).sort((a, b) => a.depth - b.depth);
}

export interface Subgraph {
  nodes: KgNodeRef[];
  edges: KgEdge[];
}

/**
 * Everything within `depth` hops of a node, as a renderable subgraph.
 *
 * Feeds the visual map screen. Edges are filtered to those whose *both*
 * endpoints survived the walk, because an edge pointing at a node that was
 * never included renders as a line into empty space.
 */
export function subgraphAround(edges: KgEdge[], start: KgNodeRef, options: WalkOptions = {}): Subgraph {
  const hits = walk(edges, start, { direction: "both", ...options });

  const keys = new Set<string>([nodeKey(start), ...hits.map((hit) => nodeKey(hit.node))]);
  const nodes = [...keys].map(parseNodeKey);

  const included = edges.filter(
    (edge) => keys.has(nodeKey(edgeFrom(edge))) && keys.has(nodeKey(edgeTo(edge)))
  );

  return { nodes, edges: included };
}

/**
 * How many edges touch each node, for sizing nodes on the map.
 *
 * Counts an edge once per endpoint, and a self-loop once — a node connected
 * only to itself is not twice as important as one with a single real link.
 */
export function degreeByNode(edges: KgEdge[]): Map<string, number> {
  const degrees = new Map<string, number>();

  const bump = (key: string) => degrees.set(key, (degrees.get(key) ?? 0) + 1);

  for (const edge of edges) {
    const fromKey = nodeKey(edgeFrom(edge));
    const toKey = nodeKey(edgeTo(edge));
    bump(fromKey);
    if (toKey !== fromKey) bump(toKey);
  }

  return degrees;
}

/**
 * The shortest route between two nodes, or null when they are unconnected.
 *
 * Powers "how is this connected to that?" on the map. Returns the node keys
 * along the route including both endpoints.
 */
export function shortestPath(
  edges: KgEdge[],
  from: KgNodeRef,
  to: KgNodeRef,
  options: WalkOptions = {}
): string[] | null {
  if (sameNode(from, to)) return [nodeKey(from)];

  const targetKey = nodeKey(to);
  const hit = walk(edges, from, { direction: "both", maxDepth: 6, ...options }).find(
    (candidate) => nodeKey(candidate.node) === targetKey
  );

  return hit ? hit.path : null;
}
