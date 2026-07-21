import { describe, expect, it } from "vitest";
import { buildTimelineEvents } from "@/lib/timeline/buildTimelineEvents";
import type { Goal, KnowledgeEntry, Moment } from "@/types";

function moment(patch: Partial<Moment>): Moment {
  return {
    id: "m1",
    timestamp: "2026-07-10T09:00:00.000Z",
    category: "knowledge",
    title: "Moment title",
    content: "Moment content",
    ...patch,
  };
}

function goal(patch: Partial<Goal>): Goal {
  return {
    id: "g1",
    title: "Goal title",
    category: "career",
    createdAt: "2026-07-01T09:00:00.000Z",
    milestones: [],
    ...patch,
  };
}

function knowledgeEntry(patch: Partial<KnowledgeEntry>): KnowledgeEntry {
  return {
    id: "k1",
    date: "2026-07-05",
    topic: "Topic",
    source: "Source",
    summary: "Summary",
    ...patch,
  };
}

describe("buildTimelineEvents", () => {
  it("returns an empty array when there is nothing to show", () => {
    expect(buildTimelineEvents({ moments: [], goals: [], knowledgeEntries: [] })).toEqual([]);
  });

  it("includes every moment, unconditionally, as a non-achievement event", () => {
    const events = buildTimelineEvents({
      moments: [moment({ id: "m1" })],
      goals: [],
      knowledgeEntries: [],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "moment", achievement: false, category: "knowledge" });
  });

  it("includes a goal_started event for every goal", () => {
    const events = buildTimelineEvents({
      moments: [],
      goals: [goal({ id: "g1", title: "Learn a new masechet", category: "faith" })],
      knowledgeEntries: [],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "goal_started", achievement: false, category: "faith" });
    expect(events[0].title).toContain("Learn a new masechet");
  });

  it("includes a milestone_achieved event only for completed milestones with a real completedAt", () => {
    const events = buildTimelineEvents({
      moments: [],
      goals: [
        goal({
          id: "g1",
          milestones: [
            { id: "done-with-date", title: "Done, dated", done: true, completedAt: "2026-07-12T00:00:00.000Z" },
            { id: "done-no-date", title: "Done, undated (pre-migration)", done: true },
            { id: "not-done", title: "Not done", done: false },
          ],
        }),
      ],
      knowledgeEntries: [],
    });

    const milestoneEvents = events.filter((e) => e.kind === "milestone_achieved");
    expect(milestoneEvents).toHaveLength(1);
    expect(milestoneEvents[0]).toMatchObject({ title: "Done, dated", achievement: true });
  });

  it("maps knowledge entries to faith-category, non-achievement events", () => {
    const events = buildTimelineEvents({
      moments: [],
      goals: [],
      knowledgeEntries: [knowledgeEntry({ topic: "Hilchot Shabbat" })],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "knowledge_session", category: "faith", achievement: false });
    expect(events[0].title).toBe("Hilchot Shabbat");
  });

  it("sorts every event kind together, newest first", () => {
    const events = buildTimelineEvents({
      moments: [moment({ id: "mid", timestamp: "2026-07-10T00:00:00.000Z" })],
      goals: [
        goal({
          id: "g1",
          createdAt: "2026-07-01T00:00:00.000Z",
          milestones: [
            { id: "newest", title: "Newest", done: true, completedAt: "2026-07-20T00:00:00.000Z" },
          ],
        }),
      ],
      knowledgeEntries: [knowledgeEntry({ id: "k1", date: "2026-07-05" })],
    });

    expect(events.map((e) => e.id)).toEqual(["milestone:newest", "moment:mid", "knowledge:k1", "goal:g1"]);
  });
});
