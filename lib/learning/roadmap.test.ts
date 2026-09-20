import { describe, expect, it } from "vitest";
import { MAX_NODES, layoutRoadmap, nextStep, nodeStatus, normalizeRoadmap, roadmapProgress } from "@/lib/learning/roadmap";

const raw = [
  { id: "basics", title: "יסודות", summary: "", dependsOn: [] },
  { id: "vars", title: "משתנים", summary: "", dependsOn: ["basics"] },
  { id: "loops", title: "לולאות", summary: "", dependsOn: ["basics"] },
  { id: "funcs", title: "פונקציות", summary: "", dependsOn: ["vars", "loops"] },
];

describe("normalizeRoadmap", () => {
  it("keeps valid nodes and resolves dependencies by id or title", () => {
    const nodes = normalizeRoadmap([...raw.slice(0, 2), { title: "לולאות", dependsOn: ["יסודות"] }]);
    expect(nodes.map((n) => n.id)).toEqual(["basics", "vars", "step-3"]);
    expect(nodes[2].dependsOn).toEqual(["basics"]);
  });

  it("drops unknown and self dependencies, and untitled nodes", () => {
    const nodes = normalizeRoadmap([{ id: "a", title: "א", dependsOn: ["a", "ghost"] }, { id: "b", title: "" }]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].dependsOn).toEqual([]);
  });

  it("breaks cycles so every step can be unlocked", () => {
    const nodes = normalizeRoadmap([
      { id: "a", title: "א", dependsOn: ["b"] },
      { id: "b", title: "ב", dependsOn: ["a"] },
    ]);
    const edges = nodes.reduce((sum, n) => sum + n.dependsOn.length, 0);
    expect(edges).toBe(1);
    expect(nextStep(nodes, new Set())).not.toBeNull();
  });

  it("caps the number of steps", () => {
    expect(normalizeRoadmap(Array.from({ length: 30 }, (_, i) => ({ title: `צעד ${i}` })))).toHaveLength(MAX_NODES);
  });
});

describe("layoutRoadmap", () => {
  const placed = layoutRoadmap(normalizeRoadmap(raw));
  const at = (id: string) => placed.find((p) => p.id === id)!;

  it("layers each step below its deepest prerequisite", () => {
    expect(at("basics").layer).toBe(0);
    expect(at("vars").layer).toBe(1);
    expect(at("loops").layer).toBe(1);
    expect(at("funcs").layer).toBe(2);
    expect(at("vars").layerSize).toBe(2);
  });
});

describe("progress", () => {
  const nodes = normalizeRoadmap(raw);

  it("knows what is done, open and locked", () => {
    const done = new Set(["basics", "vars"]);
    expect(nodeStatus(nodes[0], done)).toBe("done");
    expect(nodeStatus(nodes[2], done)).toBe("available");
    expect(nodeStatus(nodes[3], done)).toBe("locked");
    expect(roadmapProgress(nodes, done)).toBe(0.5);
    expect(nextStep(nodes, done)?.id).toBe("loops");
    expect(roadmapProgress([], done)).toBe(0);
  });
});
