import type { Goal, KnowledgeEntry, Moment } from "@/types";
import type { TimelineEvent } from "@/lib/timeline/types";

// Timeline Experience v1 (docs/ATLAS_ARCHITECTURE_VISION.md §6) — a pure
// transform, no DB access, the same "raw rows in, typed events out" shape
// every other assembly module in this codebase already uses (see
// lib/intelligence/personalDNA's analyzers). It merges data the store has
// already hydrated into one chronological shape the Timeline page renders;
// it does not fetch or invent anything.
//
// Extension point for a future module (Health once it gets a write path, a
// brand-new life area like Finance): if it's just another category of
// `moments`, nothing here changes — moments already flow through
// unconditionally, for every category. If it's a distinct entity (the way
// knowledgeEntries is to Torah), add one small `xToEvents` mapper below and
// merge its output into the same array in buildTimelineEvents — no
// registry, no plugin system, just one more function call.

interface BuildTimelineEventsInput {
  moments: Moment[];
  goals: Goal[];
  knowledgeEntries: KnowledgeEntry[];
}

function momentsToEvents(moments: Moment[]): TimelineEvent[] {
  return moments.map((m) => ({
    id: `moment:${m.id}`,
    kind: "moment",
    timestamp: m.timestamp,
    category: m.category,
    title: m.title,
    description: m.content,
    achievement: false,
  }));
}

function goalsToEvents(goals: Goal[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const goal of goals) {
    events.push({
      id: `goal:${goal.id}`,
      kind: "goal_started",
      timestamp: goal.createdAt,
      category: goal.category,
      title: `יעד חדש: ${goal.title}`,
      achievement: false,
    });

    for (const milestone of goal.milestones) {
      // Milestones completed before migration 20260720000003 added
      // completed_at have no timestamp — deliberately never backfilled with
      // a guess (docs/ATLAS_ARCHITECTURE_VISION.md §3). A milestone with no
      // real completion moment can't be placed on a chronological timeline,
      // so it's left off rather than faked.
      if (!milestone.done || !milestone.completedAt) continue;
      events.push({
        id: `milestone:${milestone.id}`,
        kind: "milestone_achieved",
        timestamp: milestone.completedAt,
        category: goal.category,
        title: milestone.title,
        description: goal.title,
        achievement: true,
      });
    }
  }

  return events;
}

function knowledgeEntriesToEvents(entries: KnowledgeEntry[]): TimelineEvent[] {
  return entries.map((entry) => ({
    id: `knowledge:${entry.id}`,
    kind: "knowledge_session",
    // entry.date is a plain "YYYY-MM-DD" — normalized to a full ISO instant
    // so it sorts correctly alongside timestamped moments/milestones.
    timestamp: new Date(entry.date).toISOString(),
    // Torah Space is currently the only feature that writes knowledgeEntries
    // (docs/ATLAS_ARCHITECTURE_VISION.md §2) — "faith" is what that maps to,
    // not a guess.
    category: "faith",
    title: entry.topic,
    description: entry.summary,
    achievement: false,
  }));
}

export function buildTimelineEvents({
  moments,
  goals,
  knowledgeEntries,
}: BuildTimelineEventsInput): TimelineEvent[] {
  const events = [
    ...momentsToEvents(moments),
    ...goalsToEvents(goals),
    ...knowledgeEntriesToEvents(knowledgeEntries),
  ];

  return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
