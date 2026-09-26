import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { hydrateFromLearningSnapshot, isLearningRoute } = await import("./offlineSnapshot");
const { useAtlasStore } = await import("@/store/useAtlasStore");

describe("hydrateFromLearningSnapshot", () => {
  beforeEach(() => useAtlasStore.setState({ hydrated: false, learningTopics: [], learningResources: [] }));

  it("fills only the learning slice and marks the store usable", () => {
    const topics = [{ id: "t1", title: "שוקולד" }] as never;
    const resources = [{ id: "r1", topicId: "t1", title: "תקציר" }] as never;
    expect(hydrateFromLearningSnapshot({ topics, resources, savedAt: "2026-09-26T10:00:00Z" })).toBe(true);
    const state = useAtlasStore.getState();
    expect(state.hydrated).toBe(true);
    expect(state.learningTopics).toEqual(topics);
    expect(state.learningResources).toEqual(resources);
    // nothing else was invented — e.g. onboarding stays at its default
    expect(state.onboardingComplete).toBe(false);
  });

  it("does nothing without a snapshot, so the honest 'no connection' screen shows", () => {
    expect(hydrateFromLearningSnapshot(undefined)).toBe(false);
    expect(useAtlasStore.getState().hydrated).toBe(false);
  });
});

describe("isLearningRoute", () => {
  it("keeps the learning routes and sends everything else to the saved hub", () => {
    expect(isLearningRoute("/areas/learning")).toBe(true);
    expect(isLearningRoute("/areas/learning/topics/abc")).toBe(true);
    expect(isLearningRoute("/")).toBe(false);
    expect(isLearningRoute("/calendar")).toBe(false);
  });
});
