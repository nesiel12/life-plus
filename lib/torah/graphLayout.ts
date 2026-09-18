// Force-directed layout and camera maths for the knowledge map.
//
// Hand-rolled rather than a graph library: the map is at most a few hundred
// nodes (lib/torah/graphMap.ts caps it), a Fruchterman–Reingold pass over
// that is ~60 lines, and owning it means the layout is SEEDED — the same
// library lays out the same way on every visit, so the learner's mental map
// ("the Rishonim are up on the left") survives a reload. Pure and testable.

export interface LayoutNode {
  key: string;
  /** Higher-degree nodes are heavier and settle toward the middle. */
  degree: number;
}

export interface LayoutEdge {
  from: string;
  to: string;
  /** 0..1 — a weak AI edge pulls less than an asserted one. */
  weight?: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface LayoutOptions {
  width?: number;
  height?: number;
  iterations?: number;
  seed?: number;
  /** Nodes kept at least this far apart after the simulation. */
  minDistance?: number;
}

/** Deterministic PRNG (mulberry32). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable seed from the node set, so adding one book reshuffles only a little. */
export function seedFor(keys: readonly string[]): number {
  let hash = 0x811c9dc5;
  for (const key of [...keys].sort()) {
    for (let i = 0; i < key.length; i++) {
      hash ^= key.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return hash >>> 0;
}

/**
 * Lays nodes out in a `width × height` box centred on the origin.
 *
 * Fruchterman–Reingold with a cooling schedule, plus a weak pull to the
 * centre so disconnected components do not drift off-canvas, and a final
 * overlap pass so labels have room.
 */
export function forceLayout(
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
  options: LayoutOptions = {}
): Map<string, Point> {
  const width = options.width ?? 1200;
  const height = options.height ?? 800;
  const iterations = options.iterations ?? 300;
  const minDistance = options.minDistance ?? 56;
  const random = seededRandom(options.seed ?? seedFor(nodes.map((n) => n.key)));

  const positions = new Map<string, Point>();
  if (nodes.length === 0) return positions;
  if (nodes.length === 1) {
    positions.set(nodes[0].key, { x: 0, y: 0 });
    return positions;
  }

  const n = nodes.length;
  const area = width * height;
  const k = Math.sqrt(area / n) * 0.75;
  const index = new Map(nodes.map((node, i) => [node.key, i]));

  // Seed on a jittered circle: a random scatter can start two nodes on top of
  // each other, and the repulsion between coincident points is undefined.
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n + random() * 0.5;
    const radius = Math.min(width, height) * (0.25 + random() * 0.2);
    xs[i] = Math.cos(angle) * radius;
    ys[i] = Math.sin(angle) * radius;
  }

  const links = edges
    .map((e) => ({ a: index.get(e.from), b: index.get(e.to), w: e.weight ?? 1 }))
    .filter((l): l is { a: number; b: number; w: number } => l.a !== undefined && l.b !== undefined && l.a !== l.b);

  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  let temperature = Math.min(width, height) / 8;
  const cooling = temperature / (iterations + 1);

  for (let step = 0; step < iterations; step++) {
    dx.fill(0);
    dy.fill(0);

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let ddx = xs[i] - xs[j];
        let ddy = ys[i] - ys[j];
        let dist = Math.hypot(ddx, ddy);
        if (dist < 0.01) {
          ddx = random() - 0.5;
          ddy = random() - 0.5;
          dist = 0.01;
        }
        const force = (k * k) / dist;
        const fx = (ddx / dist) * force;
        const fy = (ddy / dist) * force;
        dx[i] += fx;
        dy[i] += fy;
        dx[j] -= fx;
        dy[j] -= fy;
      }
    }

    for (const { a, b, w } of links) {
      const ddx = xs[a] - xs[b];
      const ddy = ys[a] - ys[b];
      const dist = Math.max(0.01, Math.hypot(ddx, ddy));
      const force = ((dist * dist) / k) * (0.4 + 0.6 * w);
      const fx = (ddx / dist) * force;
      const fy = (ddy / dist) * force;
      dx[a] -= fx;
      dy[a] -= fy;
      dx[b] += fx;
      dy[b] += fy;
    }

    for (let i = 0; i < n; i++) {
      const gravity = 0.05 * (1 + Math.min(nodes[i].degree, 10) * 0.1);
      dx[i] -= xs[i] * gravity * (k / 50);
      dy[i] -= ys[i] * gravity * (k / 50);

      const disp = Math.hypot(dx[i], dy[i]);
      if (disp > 0) {
        const limited = Math.min(disp, temperature);
        xs[i] += (dx[i] / disp) * limited;
        ys[i] += (dy[i] / disp) * limited;
      }
      xs[i] = Math.max(-width / 2, Math.min(width / 2, xs[i]));
      ys[i] = Math.max(-height / 2, Math.min(height / 2, ys[i]));
    }

    temperature = Math.max(0.5, temperature - cooling);
  }

  // Overlap removal: a few passes pushing too-close pairs apart.
  for (let pass = 0; pass < 12; pass++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const ddx = xs[i] - xs[j];
        const ddy = ys[i] - ys[j];
        const dist = Math.hypot(ddx, ddy);
        if (dist >= minDistance) continue;
        const push = (minDistance - dist) / 2 + 0.5;
        const ux = dist > 0.01 ? ddx / dist : 1;
        const uy = dist > 0.01 ? ddy / dist : 0;
        xs[i] += ux * push;
        ys[i] += uy * push;
        xs[j] -= ux * push;
        ys[j] -= uy * push;
        moved = true;
      }
    }
    if (!moved) break;
  }

  for (let i = 0; i < n; i++) {
    positions.set(nodes[i].key, { x: Math.round(xs[i] * 10) / 10, y: Math.round(ys[i] * 10) / 10 });
  }
  return positions;
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

/** Screen = world × scale + translate. */
export interface Camera {
  x: number;
  y: number;
  scale: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export const MIN_SCALE = 0.2;
export const MAX_SCALE = 3;

export function clampScale(scale: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
}

/** The camera that fits every point in the viewport with a margin. */
export function fitCamera(points: Iterable<Point>, viewport: Viewport, padding = 80): Camera {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX)) return { x: viewport.width / 2, y: viewport.height / 2, scale: 1 };

  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const scale = clampScale(
    Math.min((viewport.width - padding * 2) / spanX, (viewport.height - padding * 2) / spanY, 1.4)
  );
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { x: viewport.width / 2 - cx * scale, y: viewport.height / 2 - cy * scale, scale };
}

/** The camera that puts `point` at the viewport's centre at `scale`. */
export function focusCamera(point: Point, viewport: Viewport, scale: number): Camera {
  const s = clampScale(scale);
  return { x: viewport.width / 2 - point.x * s, y: viewport.height / 2 - point.y * s, scale: s };
}

/** Zoom by `factor` keeping the screen point `anchor` fixed (wheel / pinch). */
export function zoomAt(camera: Camera, anchor: Point, factor: number): Camera {
  const scale = clampScale(camera.scale * factor);
  const ratio = scale / camera.scale;
  return { scale, x: anchor.x - (anchor.x - camera.x) * ratio, y: anchor.y - (anchor.y - camera.y) * ratio };
}

/** Eased interpolation between cameras, t in 0..1. */
export function lerpCamera(from: Camera, to: Camera, t: number): Camera {
  const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  return {
    x: from.x + (to.x - from.x) * e,
    y: from.y + (to.y - from.y) * e,
    scale: from.scale + (to.scale - from.scale) * e,
  };
}
