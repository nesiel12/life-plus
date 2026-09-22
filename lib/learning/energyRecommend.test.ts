import { describe, expect, it } from "vitest";
import { classifyTopicDemand, recommendStudyTopics, studyFit } from "@/lib/learning/energyRecommend";
import type { LearningResource, LearningTopic } from "@/types";

const topic = (id: string): LearningTopic => ({ id, title: `נושא ${id}`, status: "active", createdAt: "2026-09-01T00:00:00Z" });
const res = (id: string, topicId: string, type: LearningResource["type"], isCompleted = false): LearningResource => ({
  id,
  topicId,
  type,
  title: id,
  isCompleted,
  createdAt: "2026-09-01T00:00:00Z",
});

describe("classifyTopicDemand", () => {
  it("reads articles/summaries as deep study", () => {
    expect(classifyTopicDemand([res("1", "t", "article")])).toBe("deep");
    expect(classifyTopicDemand([res("1", "t", "summary")])).toBe("deep");
  });

  it("reads podcasts/equipment as light", () => {
    expect(classifyTopicDemand([res("1", "t", "podcast")])).toBe("light");
    expect(classifyTopicDemand([res("1", "t", "equipment")])).toBe("light");
  });

  it("reads a handful of queued videos as a deep sit-down watch, one or two as light", () => {
    expect(classifyTopicDemand([res("1", "t", "youtube"), res("2", "t", "youtube"), res("3", "t", "youtube")])).toBe("deep");
    expect(classifyTopicDemand([res("1", "t", "youtube")])).toBe("light");
  });

  it("ignores already-completed resources — only what is left matters", () => {
    expect(classifyTopicDemand([res("1", "t", "article", true), res("2", "t", "podcast", false)])).toBe("light");
  });

  it("is neutral with nothing left, or a genuine mix", () => {
    expect(classifyTopicDemand([])).toBe("neutral");
    expect(classifyTopicDemand([res("1", "t", "article", true), res("2", "t", "podcast", true)])).toBe("neutral");
    expect(classifyTopicDemand([res("1", "t", "article"), res("2", "t", "podcast")])).toBe("neutral");
  });
});

describe("studyFit", () => {
  it("matches deep demand to deep energy and light to light", () => {
    expect(studyFit("deep", "deep")).toBe("match");
    expect(studyFit("light", "light")).toBe("match");
  });

  it("calls the opposite pairing a mismatch", () => {
    expect(studyFit("deep", "light")).toBe("mismatch");
    expect(studyFit("light", "deep")).toBe("mismatch");
  });

  it("has no opinion at steady/rest energy, or about a neutral topic", () => {
    for (const intensity of ["regular", "rest"] as const) {
      expect(studyFit("deep", intensity)).toBe("neutral");
      expect(studyFit("light", intensity)).toBe("neutral");
    }
    expect(studyFit("neutral", "deep")).toBe("neutral");
  });
});

describe("recommendStudyTopics", () => {
  const deepTopic = topic("deep");
  const lightTopic = topic("light");
  const deepResources = [res("1", "deep", "article"), res("2", "deep", "summary")];
  const lightResources = [res("3", "light", "podcast")];

  it("promotes the matching topic at peak energy", () => {
    const result = recommendStudyTopics([lightTopic, deepTopic], [...lightResources, ...deepResources], "deep");
    expect(result[0].topic.id).toBe("deep");
    expect(result[0].fit).toBe("match");
    expect(result[0].label).toContain("עמוק");
  });

  it("promotes the matching topic when energy is low", () => {
    const result = recommendStudyTopics([deepTopic, lightTopic], [...deepResources, ...lightResources], "light");
    expect(result[0].topic.id).toBe("light");
    expect(result[0].label).toContain("קליל");
  });

  it("excludes a topic with nothing in it, or nothing left to do", () => {
    const empty = topic("empty");
    const finished = topic("finished");
    const result = recommendStudyTopics(
      [empty, finished, deepTopic],
      [...deepResources, res("f1", "finished", "article", true)],
      "deep"
    );
    expect(result.map((r) => r.topic.id)).toEqual(["deep"]);
  });

  it("breaks ties on fit by how little is left to finish", () => {
    const almostDone = topic("almost");
    const justStarted = topic("started");
    const resources = [
      res("a1", "almost", "article", true),
      res("a2", "almost", "article"), // 1 left
      res("b1", "started", "article"),
      res("b2", "started", "article"),
      res("b3", "started", "article"), // 3 left
    ];
    const result = recommendStudyTopics([justStarted, almostDone], resources, "deep");
    expect(result.map((r) => r.topic.id)).toEqual(["almost", "started"]);
  });

  it("keeps input order at steady energy (no preference to apply)", () => {
    const result = recommendStudyTopics([lightTopic, deepTopic], [...lightResources, ...deepResources], "regular");
    expect(result.map((r) => r.topic.id)).toEqual(["light", "deep"]);
  });

  it("returns an empty list for an empty lab", () => {
    expect(recommendStudyTopics([], [], "deep")).toEqual([]);
  });
});
