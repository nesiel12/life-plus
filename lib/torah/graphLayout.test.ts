import { describe, expect, it } from "vitest";
import {
  MAX_SCALE,
  MIN_SCALE,
  fitCamera,
  focusCamera,
  forceLayout,
  lerpCamera,
  seedFor,
  seededRandom,
  zoomAt,
} from "@/lib/torah/graphLayout";

const nodes = Array.from({ length: 24 }, (_, i) => ({ key: `n${i}`, degree: i < 6 ? 2 : 1 }));
// Two clusters: n0..n5 in a ring, n6..n23 a chain.
const edges = [
  ...Array.from({ length: 6 }, (_, i) => ({ from: `n${i}`, to: `n${(i + 1) % 6}` })),
  ...Array.from({ length: 17 }, (_, i) => ({ from: `n${i + 6}`, to: `n${i + 7}` })),
];

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe("seeded randomness", () => {
  it("repeats for a seed and differs between seeds", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(seededRandom(1)()).not.toBe(seededRandom(2)());
  });

  it("derives the same seed regardless of node order", () => {
    expect(seedFor(["a", "b", "c"])).toBe(seedFor(["c", "a", "b"]));
  });
});

describe("forceLayout", () => {
  it("is deterministic", () => {
    expect([...forceLayout(nodes, edges)]).toEqual([...forceLayout([...nodes], edges)]);
  });

  it("places every node inside the box with finite coordinates", () => {
    const positions = forceLayout(nodes, edges, { width: 1000, height: 700 });
    expect(positions.size).toBe(nodes.length);
    for (const p of positions.values()) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(560);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(410);
    }
  });

  it("keeps connected nodes closer than the average pair", () => {
    const positions = forceLayout(nodes, edges);
    const linked = edges.map((e) => dist(positions.get(e.from)!, positions.get(e.to)!));
    const all: number[] = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) all.push(dist(positions.get(nodes[i].key)!, positions.get(nodes[j].key)!));
    }
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(avg(linked)).toBeLessThan(avg(all));
  });

  it("leaves room between nodes", () => {
    const positions = [...forceLayout(nodes, edges, { minDistance: 40 }).values()];
    let closest = Infinity;
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) closest = Math.min(closest, dist(positions[i], positions[j]));
    }
    expect(closest).toBeGreaterThan(30);
  });

  it("handles empty and single-node graphs", () => {
    expect(forceLayout([], []).size).toBe(0);
    expect(forceLayout([{ key: "a", degree: 0 }], []).get("a")).toEqual({ x: 0, y: 0 });
  });
});

describe("camera", () => {
  const viewport = { width: 800, height: 600 };

  it("fits all points inside the viewport", () => {
    const points = [{ x: -500, y: -100 }, { x: 500, y: 300 }];
    const camera = fitCamera(points, viewport, 50);
    for (const p of points) {
      const sx = p.x * camera.scale + camera.x;
      const sy = p.y * camera.scale + camera.y;
      expect(sx).toBeGreaterThanOrEqual(49);
      expect(sx).toBeLessThanOrEqual(751);
      expect(sy).toBeGreaterThanOrEqual(0);
      expect(sy).toBeLessThanOrEqual(600);
    }
  });

  it("focuses a point at the centre, clamping the scale", () => {
    const camera = focusCamera({ x: 100, y: -40 }, viewport, 10);
    expect(camera.scale).toBe(MAX_SCALE);
    expect(100 * camera.scale + camera.x).toBe(400);
    expect(-40 * camera.scale + camera.y).toBe(300);
  });

  it("zooms around an anchor without moving it", () => {
    const camera = { x: 120, y: 80, scale: 1 };
    const anchor = { x: 300, y: 200 };
    const world = { x: (anchor.x - camera.x) / camera.scale, y: (anchor.y - camera.y) / camera.scale };
    const zoomed = zoomAt(camera, anchor, 1.5);
    expect(world.x * zoomed.scale + zoomed.x).toBeCloseTo(anchor.x);
    expect(world.y * zoomed.scale + zoomed.y).toBeCloseTo(anchor.y);
    expect(zoomAt(camera, anchor, 0.0001).scale).toBe(MIN_SCALE);
  });

  it("interpolates from start to end", () => {
    const a = { x: 0, y: 0, scale: 1 };
    const b = { x: 100, y: -50, scale: 2 };
    expect(lerpCamera(a, b, 0)).toEqual(a);
    expect(lerpCamera(a, b, 1)).toEqual(b);
    expect(lerpCamera(a, b, 0.5).x).toBeCloseTo(50);
  });
});
