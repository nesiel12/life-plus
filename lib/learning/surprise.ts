import { topicProgress } from "@/lib/learning/xp";
import type { LearningResource, LearningTopic } from "@/types";

// "חפור בנושא אקראי" — the surprise shuffle.
//
// Two separate questions, kept separate so each is testable: WHICH topic to land
// on (pickSurpriseTopic), and HOW the slot-machine roll gets there (buildRoll).
// The roll is planned up front and always ends on the chosen topic, so the
// animation can never disagree with the answer.

/** A random source in [0, 1). Math.random in the app, a seeded one in tests. */
export type Rng = () => number;

/** mulberry32 — a tiny deterministic generator, for tests and reproducible rolls. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A surprise should be worth having. Half-finished topics are where a nudge
// helps most; untouched ones next; a topic with nothing in it can't be dug
// into yet; a finished one is only rarely the answer.
const WEIGHT = { inProgress: 4, notStarted: 2.5, empty: 1, complete: 0.4 } as const;

function weightOf(topic: LearningTopic, resources: readonly LearningResource[]): number {
  const progress = topicProgress(resources.filter((r) => r.topicId === topic.id));
  if (progress.total === 0) return WEIGHT.empty;
  if (progress.complete) return WEIGHT.complete;
  return progress.done > 0 ? WEIGHT.inProgress : WEIGHT.notStarted;
}

/** The id of the topic to dig into, or null when there are none. */
export function pickSurpriseTopic(
  topics: readonly LearningTopic[],
  resources: readonly LearningResource[],
  rng: Rng = Math.random
): string | null {
  if (topics.length === 0) return null;

  const weights = topics.map((t) => weightOf(t, resources));
  let roll = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < topics.length; i++) {
    roll -= weights[i];
    if (roll < 0) return topics[i].id;
  }
  return topics[topics.length - 1].id;
}

export interface RollStep {
  /** Which card is lit. */
  index: number;
  /** How long it stays lit before the next, in ms. */
  delayMs: number;
}

export interface RollOptions {
  minSteps?: number;
  fastMs?: number;
  slowMs?: number;
}

/**
 * A slot-machine roll across `count` cards that ends exactly on `targetIndex`.
 *
 * The highlight advances one card at a time (wrapping), starting from a random
 * card, and each step lasts longer than the last — quick at first, then easing
 * to a crawl, the way a reel slows. The step count is chosen so the final step
 * is the target, with enough steps that the roll always reads as a roll.
 */
export function buildRoll(count: number, targetIndex: number, rng: Rng = Math.random, options: RollOptions = {}): RollStep[] {
  if (count <= 0) return [];
  const target = Math.min(count - 1, Math.max(0, Math.floor(targetIndex)));
  const { minSteps = 14, fastMs = 45, slowMs = 300 } = options;

  // A single card has nothing to roll across: it just lands.
  if (count === 1) return [{ index: 0, delayMs: slowMs }];

  const start = Math.floor(rng() * count) % count;
  const distance = (target - start + count) % count;
  // Whole laps until there are enough steps; the last step lands on the target.
  let steps = distance + 1;
  while (steps < minSteps) steps += count;

  return Array.from({ length: steps }, (_, i) => {
    const t = steps === 1 ? 1 : i / (steps - 1);
    return { index: (start + i) % count, delayMs: Math.round(fastMs + (slowMs - fastMs) * t ** 2.2) };
  });
}
