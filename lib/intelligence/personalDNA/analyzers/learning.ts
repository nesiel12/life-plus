import { tokenize } from "@/lib/memory/rankRelevance";
import type { PatternCandidate } from "@/lib/intelligence/personalDNA/types";

const MIN_TOPIC_EVIDENCE = 3;
const MIN_TOPIC_REPEAT_COUNT = 2; // a word must actually recur, not just appear once
const MIN_CADENCE_EVIDENCE = 2;
const MIN_CADENCE_SPAN_DAYS = 7;
const CADENCE_CONFIDENT_SPAN_DAYS = 30; // span at which strength saturates

export interface LearningEntryInput {
  topic: string;
  source: string;
  date: string; // ISO date
}

// Learning patterns (docs/ATLAS_ARCHITECTURE_VISION.md §3): what he
// actually studies (topic-word frequency across knowledge_entries) and how
// often (session cadence) — both read directly off Torah Space's real log,
// nothing inferred beyond it.
export function analyzeLearningPatterns(entries: LearningEntryInput[]): PatternCandidate[] {
  const candidates: PatternCandidate[] = [];

  if (entries.length >= MIN_TOPIC_EVIDENCE) {
    const wordCounts = new Map<string, number>();
    for (const entry of entries) {
      for (const token of tokenize(`${entry.topic} ${entry.source}`)) {
        wordCounts.set(token, (wordCounts.get(token) ?? 0) + 1);
      }
    }

    let topWord: string | null = null;
    let topCount = 0;
    for (const [word, count] of wordCounts) {
      if (count > topCount) {
        topWord = word;
        topCount = count;
      }
    }

    if (topWord && topCount >= MIN_TOPIC_REPEAT_COUNT) {
      candidates.push({
        category: "learning",
        patternType: "learningTopicFocus",
        subject: "",
        value: topWord,
        description: `לומד לעיתים קרובות על נושאים הקשורים ל"${topWord}" (${topCount} מתוך ${entries.length} רשומות).`,
        evidenceCount: entries.length,
        strength: topCount / entries.length,
        source: "knowledge_entries",
      });
    }
  }

  if (entries.length >= MIN_CADENCE_EVIDENCE) {
    const timestamps = entries.map((entry) => new Date(entry.date).getTime()).sort((a, b) => a - b);
    const spanDays = (timestamps[timestamps.length - 1] - timestamps[0]) / 86_400_000;

    if (spanDays >= MIN_CADENCE_SPAN_DAYS) {
      const perWeek = entries.length / (spanDays / 7);
      candidates.push({
        category: "learning",
        patternType: "learningCadence",
        subject: "",
        value: perWeek.toFixed(1),
        description: `לומד בממוצע כ-${perWeek.toFixed(1)} שיעורים בשבוע.`,
        evidenceCount: entries.length,
        strength: Math.min(1, spanDays / CADENCE_CONFIDENT_SPAN_DAYS),
        source: "knowledge_entries",
      });
    }
  }

  return candidates;
}
