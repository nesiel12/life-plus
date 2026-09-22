import type { TaskIntensity } from "@/lib/dashboard/context";
import { topicProgress } from "@/lib/learning/xp";
import type { LearningResource, LearningResourceType, LearningTopic } from "@/types";

// Energy-aware study sessions: "מיקוד עמוק" vs "משהו קליל" — which open topic
// suits the circadian energy you actually have right now
// (lib/health/energyCurve.ts, by way of lib/dashboard/context.ts's
// energyGuidance). Same shape as the dashboard's Health<->Tasks rule
// (lib/intelligence/crossModule/energyTasks.ts): classify demand, then rank
// by fit, and never let an overdue-feeling stalled topic hide just because it
// is the wrong weight for the moment.

export type StudyDemand = "deep" | "light" | "neutral";

/** Resource types read as sit-down, concentrated study; the rest are lighter. */
const DEEP_TYPES = new Set<LearningResourceType>(["article", "summary"]);
const LIGHT_TYPES = new Set<LearningResourceType>(["podcast", "equipment"]);

/**
 * A topic's weight, from what is actually left to do in it — not from its
 * title (unlike a task, a learning topic's title rarely says whether it is
 * "study" or "an errand"; its remaining resources do). A youtube-heavy topic
 * reads as deep once there are several videos queued (a real sit-down watch),
 * and light when there is only one or two (a quick watch) — everything else
 * follows the type split above.
 */
export function classifyTopicDemand(resources: readonly Pick<LearningResource, "type" | "isCompleted">[]): StudyDemand {
  const remaining = resources.filter((r) => !r.isCompleted);
  if (remaining.length === 0) return "neutral";

  const deepCount = remaining.filter((r) => DEEP_TYPES.has(r.type)).length;
  const lightCount = remaining.filter((r) => LIGHT_TYPES.has(r.type)).length;
  const videoCount = remaining.filter((r) => r.type === "youtube").length;

  if (deepCount > lightCount && deepCount >= videoCount) return "deep";
  if (lightCount > deepCount) return "light";
  if (videoCount >= 3) return "deep";
  if (videoCount > 0) return "light";
  return "neutral";
}

export type StudyFit = "match" | "neutral" | "mismatch";

export function studyFit(demand: StudyDemand, intensity: TaskIntensity): StudyFit {
  if (demand === "neutral") return "neutral";
  if (intensity === "deep") return demand === "deep" ? "match" : "mismatch";
  if (intensity === "light") return demand === "light" ? "match" : "mismatch";
  return "neutral";
}

export interface StudyRecommendation {
  topic: LearningTopic;
  demand: StudyDemand;
  fit: StudyFit;
  /** Resources left before this topic is complete. */
  remaining: number;
  label: string | null;
}

const FIT_RANK: Record<StudyFit, number> = { match: 0, neutral: 1, mismatch: 2 };

function fitLabel(demand: StudyDemand, fit: StudyFit): string | null {
  if (fit === "match") return demand === "deep" ? "מיקוד עמוק — מתאים לשיא האנרגיה" : "קליל — מתאים לעכשיו";
  return null;
}

/**
 * Open (not-yet-complete) topics ranked for the current energy: matching
 * topics lead, ties broken by how little is left (closer to finishing beats
 * starting something new), then by the caller's own order. A topic with
 * nothing left (fully complete) never appears — there is nothing to study.
 */
export function recommendStudyTopics(
  topics: readonly LearningTopic[],
  resources: readonly LearningResource[],
  intensity: TaskIntensity
): StudyRecommendation[] {
  return topics
    .map((topic, index) => {
      const own = resources.filter((r) => r.topicId === topic.id);
      const progress = topicProgress(own);
      const demand = classifyTopicDemand(own);
      const fit = studyFit(demand, intensity);
      return { topic, demand, fit, remaining: progress.total - progress.done, index, hasContent: progress.total > 0 };
    })
    .filter((entry) => entry.hasContent && entry.remaining > 0)
    .sort((a, b) => FIT_RANK[a.fit] - FIT_RANK[b.fit] || a.remaining - b.remaining || a.index - b.index)
    .map(({ topic, demand, fit, remaining }) => ({ topic, demand, fit, remaining, label: fitLabel(demand, fit) }));
}
