import { describe, expect, it } from "vitest";
import {
  buildRecommendations,
  energyMatchedTopics,
  momentumTopics,
  stalledTopics,
} from "@/lib/learning/recommendations";
import { energyGuidance } from "@/lib/dashboard/context";
import { energyCurve } from "@/lib/health/energyCurve";
import type { LearningResource, LearningTopic } from "@/types";

const daysAgo = (n: number, from = new Date("2026-09-22T12:00:00Z")) => new Date(from.getTime() - n * 86_400_000).toISOString();

const topic = (id: string, overrides: Partial<LearningTopic> = {}): LearningTopic => ({
  id,
  title: `נושא ${id}`,
  status: "active",
  createdAt: daysAgo(10),
  ...overrides,
});
const res = (id: string, topicId: string, isCompleted = false, type: LearningResource["type"] = "article"): LearningResource => ({
  id,
  topicId,
  type,
  title: id,
  isCompleted,
  createdAt: "2026-09-01T00:00:00Z",
});

const NOW = new Date("2026-09-22T12:00:00Z");

describe("stalledTopics", () => {
  it("flags a topic with real content and near-zero progress, old enough to count as stalled", () => {
    const t = topic("a", { createdAt: daysAgo(10) });
    const result = stalledTopics([t], [res("1", "a", false), res("2", "a", false)], NOW);
    expect(result).toHaveLength(1);
    expect(result[0].topic.id).toBe("a");
    expect(result[0].reason).toContain("לא התחלת");
  });

  it("gives a different reason once at least one step is done", () => {
    const t = topic("a", { createdAt: daysAgo(10) });
    const result = stalledTopics([t], [res("1", "a", true), res("2", "a", false), res("3", "a", false), res("4", "a", false), res("5", "a", false), res("6", "a", false), res("7", "a", false)], NOW);
    expect(result[0].reason).toMatch(/^התקדמת/);
  });

  it("does not flag a brand-new topic just because it hasn't started", () => {
    const fresh = topic("fresh", { createdAt: daysAgo(1) });
    expect(stalledTopics([fresh], [res("1", "fresh", false)], NOW)).toEqual([]);
  });

  it("does not flag a topic with real progress, or one with nothing in it", () => {
    const wellStarted = topic("started", { createdAt: daysAgo(10) });
    const empty = topic("empty", { createdAt: daysAgo(10) });
    const result = stalledTopics(
      [wellStarted, empty],
      [res("1", "started", true), res("2", "started", true), res("3", "started", false)],
      NOW
    );
    expect(result).toEqual([]);
  });

  it("does not flag a completed topic", () => {
    const done = topic("done", { createdAt: daysAgo(10), status: "completed" });
    expect(stalledTopics([done], [res("1", "done", false)], NOW)).toEqual([]);
  });

  it("ranks the least-progressed, oldest first, capped at two", () => {
    const topics = ["a", "b", "c"].map((id) => topic(id, { createdAt: daysAgo(20) }));
    const resources = [
      res("1", "a", false), // a: 0%
      res("2", "b", true), res("3", "b", false), res("4", "b", false), res("5", "b", false), res("6", "b", false), res("7", "b", false), res("8", "b", false), res("9", "b", false), // b: ~11%
      res("10", "c", false), // c: 0%, but newer
    ];
    const result = stalledTopics(topics, resources, NOW);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.topic.id)).toContain("a");
  });
});

describe("momentumTopics", () => {
  it("suggests a related topic once its neighbour is almost done", () => {
    const almostDone = topic("physics", { title: "פיזיקה קוונטית", category: "מדעים" });
    const related = topic("chem", { title: "כימיה קוונטית", category: "מדעים" });
    const resources = [
      res("p1", "physics", true), res("p2", "physics", true), res("p3", "physics", true), res("p4", "physics", false), // 75%... need >=0.8
      res("c1", "chem", false), res("c2", "chem", false),
    ];
    // Bump physics to 80%+.
    const strongerResources = [...resources.slice(0, 3), res("p4b", "physics", true), res("c1", "chem", false), res("c2", "chem", false)];
    const result = momentumTopics([almostDone, related], strongerResources);
    expect(result.map((r) => r.topic.id)).toEqual(["chem"]);
    expect(result[0].reason).toContain("פיזיקה קוונטית");
  });

  it("suggests nothing when no neighbour is near finished", () => {
    const a = topic("a", { title: "פיזיקה קוונטית", category: "מדעים" });
    const b = topic("b", { title: "כימיה קוונטית", category: "מדעים" });
    const resources = [res("a1", "a", false), res("a2", "a", false), res("b1", "b", false)];
    expect(momentumTopics([a, b], resources)).toEqual([]);
  });

  it("suggests nothing for unrelated topics, however far along one is", () => {
    const a = topic("a", { title: "פייתון", category: "תכנות" });
    const b = topic("b", { title: "בישול איטלקי", category: "אוכל" });
    const resources = [res("a1", "a", true), res("b1", "b", false)];
    expect(momentumTopics([a, b], resources)).toEqual([]);
  });

  it("does not suggest a neighbour that is itself already almost done", () => {
    const a = topic("a", { title: "פיזיקה קוונטית", category: "מדעים" });
    const b = topic("b", { title: "כימיה קוונטית", category: "מדעים" });
    const resources = [
      res("a1", "a", true), res("a2", "a", true), res("a3", "a", true), res("a4", "a", true),
      res("b1", "b", true), res("b2", "b", true), res("b3", "b", true), res("b4", "b", true),
    ];
    expect(momentumTopics([a, b], resources)).toEqual([]);
  });

  it("does not suggest a neighbour with nothing in it", () => {
    const a = topic("a", { title: "פיזיקה קוונטית", category: "מדעים" });
    const empty = topic("b", { title: "כימיה קוונטית", category: "מדעים" });
    const resources = [res("a1", "a", true), res("a2", "a", true), res("a3", "a", true), res("a4", "a", true)];
    expect(momentumTopics([a, empty], resources)).toEqual([]);
  });
});

describe("energyMatchedTopics", () => {
  it("surfaces a deep topic at peak energy with a peak-flavoured reason", () => {
    const t = topic("deep");
    const result = energyMatchedTopics([t], [res("1", "deep", false, "article"), res("2", "deep", false, "summary")], "deep");
    expect(result[0].topic.id).toBe("deep");
    expect(result[0].reason).toContain("ריכוז");
  });

  it("returns nothing when nothing fits", () => {
    expect(energyMatchedTopics([], [], "deep")).toEqual([]);
  });
});

describe("buildRecommendations", () => {
  const curve = energyCurve();
  const noon = new Date(2026, 8, 22, 11, 0, 0); // an energy peak, per the model's defaults

  it("combines all three sources without duplicating a topic", () => {
    const energyTopic = topic("energy-pick", { createdAt: daysAgo(1) });
    const stalled = topic("stalled-pick", { createdAt: daysAgo(20) });
    const resources = [
      res("e1", "energy-pick", false, "article"),
      res("e2", "energy-pick", false, "summary"),
      res("s1", "stalled-pick", false),
    ];
    const energy = energyGuidance(curve, noon);
    const result = buildRecommendations([energyTopic, stalled], resources, energy, noon);
    const ids = result.map((r) => r.topic.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("energy-pick");
    expect(ids).toContain("stalled-pick");
  });

  it("prefers the energy-matched reason over a stalled/momentum reason for the same topic", () => {
    // Old and barely started (stalled) AND a deep-demand match at peak energy — energy reason should win.
    const t = topic("both", { createdAt: daysAgo(20) });
    const resources = [res("1", "both", false, "article"), res("2", "both", false, "summary")];
    const energy = energyGuidance(curve, noon);
    const result = buildRecommendations([t], resources, energy, noon);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("energy");
  });

  it("returns an empty list for an empty lab", () => {
    const energy = energyGuidance(curve, noon);
    expect(buildRecommendations([], [], energy, noon)).toEqual([]);
  });

  it("caps the total at five", () => {
    const topics = Array.from({ length: 10 }, (_, i) => topic(`t${i}`, { createdAt: daysAgo(20) }));
    const resources = topics.flatMap((t) => [res(`${t.id}-1`, t.id, false)]);
    const energy = energyGuidance(curve, noon);
    expect(buildRecommendations(topics, resources, energy, noon).length).toBeLessThanOrEqual(5);
  });
});
