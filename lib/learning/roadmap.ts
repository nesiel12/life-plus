// Subject roadmaps — a new topic as a tree of steps with prerequisites.
//
// Pure. The model proposes nodes and their dependencies; this module makes the
// graph sound (known ids only, no cycles), lays it out in layers for the
// node-tree view, and answers what is done, open, or still locked.

export interface RoadmapNode {
  id: string;
  title: string;
  summary: string;
  dependsOn: string[];
}

export interface RawRoadmapNode {
  id?: string;
  title?: string;
  summary?: string;
  dependsOn?: string[];
}

export const MAX_NODES = 12;

/** ASCII-safe, stable ids — the model's ids are only hints. */
function slug(value: string, index: number): string {
  const ascii = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return ascii || `step-${index + 1}`;
}

/**
 * A sound graph: unique ids, dependencies on known nodes only, no self-loops,
 * and no cycles — a back edge found by depth-first search is dropped, because
 * a step that is its own prerequisite can never be unlocked.
 */
export function normalizeRoadmap(raw: readonly RawRoadmapNode[]): RoadmapNode[] {
  const idMap = new Map<string, string>();
  const nodes: RoadmapNode[] = [];
  const used = new Set<string>();

  raw.slice(0, MAX_NODES).forEach((r, index) => {
    const title = (r.title ?? "").trim();
    if (!title) return;
    let id = slug(r.id ?? title, index);
    while (used.has(id)) id = `${id}-${index + 1}`;
    used.add(id);
    if (r.id) idMap.set(r.id, id);
    idMap.set(title, id);
    nodes.push({ id, title, summary: (r.summary ?? "").trim(), dependsOn: (r.dependsOn ?? []).map(String) });
  });

  for (const node of nodes) {
    node.dependsOn = [...new Set(node.dependsOn.map((d) => idMap.get(d) ?? d))].filter(
      (d) => d !== node.id && used.has(d)
    );
  }

  // Break cycles: DFS, drop any edge back into the current path.
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const state = new Map<string, "visiting" | "done">();
  const visit = (node: RoadmapNode) => {
    state.set(node.id, "visiting");
    node.dependsOn = node.dependsOn.filter((dep) => {
      if (state.get(dep) === "visiting") return false;
      if (!state.has(dep)) visit(byId.get(dep)!);
      return true;
    });
    state.set(node.id, "done");
  };
  for (const node of nodes) if (!state.has(node.id)) visit(node);

  return nodes;
}

export interface PlacedNode extends RoadmapNode {
  layer: number;
  /** Position within the layer. */
  slot: number;
  /** Nodes in this node's layer. */
  layerSize: number;
}

/**
 * Layers by longest path from a root — a step sits one row below its deepest
 * prerequisite — then each layer is ordered by the average slot of its
 * parents, which keeps edges short and mostly uncrossed.
 */
export function layoutRoadmap(nodes: readonly RoadmapNode[]): PlacedNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const layerOf = new Map<string, number>();
  const depth = (id: string, seen: Set<string> = new Set()): number => {
    if (layerOf.has(id)) return layerOf.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const node = byId.get(id);
    const layer = node && node.dependsOn.length > 0 ? 1 + Math.max(...node.dependsOn.map((d) => depth(d, seen))) : 0;
    layerOf.set(id, layer);
    return layer;
  };
  for (const node of nodes) depth(node.id);

  const layers: RoadmapNode[][] = [];
  for (const node of nodes) (layers[layerOf.get(node.id)!] ??= []).push(node);

  const slotOf = new Map<string, number>();
  const placed: PlacedNode[] = [];
  layers.forEach((layer, layerIndex) => {
    const ordered =
      layerIndex === 0
        ? layer
        : [...layer].sort((a, b) => {
            const avg = (n: RoadmapNode) =>
              n.dependsOn.length ? n.dependsOn.reduce((s, d) => s + (slotOf.get(d) ?? 0), 0) / n.dependsOn.length : 0;
            return avg(a) - avg(b);
          });
    ordered.forEach((node, slot) => {
      slotOf.set(node.id, slot);
      placed.push({ ...node, layer: layerIndex, slot, layerSize: ordered.length });
    });
  });
  return placed;
}

export type NodeStatus = "done" | "available" | "locked";

export function nodeStatus(node: RoadmapNode, completed: ReadonlySet<string>): NodeStatus {
  if (completed.has(node.id)) return "done";
  return node.dependsOn.every((d) => completed.has(d)) ? "available" : "locked";
}

export function roadmapProgress(nodes: readonly RoadmapNode[], completed: ReadonlySet<string>): number {
  if (nodes.length === 0) return 0;
  return nodes.filter((n) => completed.has(n.id)).length / nodes.length;
}

/** The first step that is open now — "המשך מכאן". */
export function nextStep(nodes: readonly RoadmapNode[], completed: ReadonlySet<string>): RoadmapNode | null {
  return layoutRoadmap(nodes)
    .sort((a, b) => a.layer - b.layer || a.slot - b.slot)
    .find((n) => nodeStatus(n, completed) === "available") ?? null;
}
