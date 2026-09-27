import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { hydrateFromOfflineSnapshot } = await import("./offlineSnapshot");
const { useAtlasStore } = await import("@/store/useAtlasStore");

describe("hydrateFromOfflineSnapshot", () => {
  beforeEach(() =>
    useAtlasStore.setState({
      hydrated: false,
      learningTopics: [],
      learningResources: [],
      tasks: [],
      onboardingComplete: false,
    })
  );

  it("replays the whole bootstrap payload, not just learning — every domain the real load sets", () => {
    const state = {
      learningTopics: [{ id: "t1", title: "שוקולד" }],
      learningResources: [{ id: "r1", topicId: "t1", title: "תקציר" }],
      tasks: [{ id: "k1", title: "לקנות חלב" }],
      onboardingComplete: true,
    };
    expect(hydrateFromOfflineSnapshot({ state: state as never, savedAt: "2026-09-27T10:00:00Z" })).toBe(true);
    const after = useAtlasStore.getState();
    expect(after.hydrated).toBe(true);
    expect(after.learningTopics).toEqual(state.learningTopics);
    expect(after.tasks).toEqual(state.tasks);
    expect(after.onboardingComplete).toBe(true);
  });

  it("does nothing without a snapshot, so the honest 'no connection' screen shows", () => {
    expect(hydrateFromOfflineSnapshot(undefined)).toBe(false);
    expect(useAtlasStore.getState().hydrated).toBe(false);
  });
});
