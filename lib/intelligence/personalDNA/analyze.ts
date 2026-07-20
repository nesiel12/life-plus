import "server-only";
import { momentsRepo } from "@/lib/db/moments";
import { knowledgeEntriesRepo } from "@/lib/db/knowledgeEntries";
import { goalsRepo } from "@/lib/db/goals";
import { personalPatternsRepo } from "@/lib/db/personalPatterns";
import { toMoment, toKnowledgeEntry } from "@/lib/mappers";
import { analyzeFocusPatterns } from "@/lib/intelligence/personalDNA/analyzers/focus";
import { analyzeLearningPatterns } from "@/lib/intelligence/personalDNA/analyzers/learning";
import { analyzeGoalPatterns } from "@/lib/intelligence/personalDNA/analyzers/goals";
import { analyzeRoutinePatterns } from "@/lib/intelligence/personalDNA/analyzers/routine";
import { resolvePatternUpdate } from "@/lib/intelligence/personalDNA/confidence";
import type { PatternCandidate } from "@/lib/intelligence/personalDNA/types";

// The Observation -> Analysis -> Insight step of the self-learning loop
// (docs/ATLAS_ARCHITECTURE_VISION.md §3). Stateless by design: every run
// recomputes candidates fresh from current data (not an incremental
// accumulator), then reconciles each one against whatever is already
// stored — that reconciliation (resolvePatternUpdate) is what makes
// repeated evidence increase confidence and a reversed pattern get
// discounted, without needing to persist any analysis state beyond the
// patterns themselves.
export async function analyzePersonalDNA(userId: string): Promise<void> {
  const [momentRows, knowledgeRows, goalRows, existingPatterns] = await Promise.all([
    momentsRepo.list(userId),
    knowledgeEntriesRepo.list(userId),
    goalsRepo.listWithMilestones(userId),
    personalPatternsRepo.list(userId),
  ]);

  const moments = momentRows.map(toMoment);
  const knowledgeEntries = knowledgeRows.map(toKnowledgeEntry);

  const goalSummaries = goalRows.map((goal) => ({
    createdAt: goal.created_at,
    milestoneCount: goal.milestones.length,
    doneCount: goal.milestones.filter((m) => m.done).length,
  }));

  const completedMilestones = goalRows
    .flatMap((goal) => goal.milestones)
    .filter((milestone) => milestone.done && milestone.completed_at !== null)
    .map((milestone) => ({
      createdAt: milestone.created_at,
      completedAt: milestone.completed_at as string,
    }));

  const activityDates = [...moments.map((m) => m.timestamp), ...knowledgeEntries.map((k) => k.date)];

  const candidates: PatternCandidate[] = [
    ...analyzeFocusPatterns(moments.map((m) => ({ category: m.category, occurredAt: m.timestamp }))),
    ...analyzeLearningPatterns(knowledgeEntries.map((k) => ({ topic: k.topic, source: k.source, date: k.date }))),
    ...analyzeGoalPatterns(goalSummaries, completedMilestones),
    ...analyzeRoutinePatterns(activityDates),
  ];

  const existingByKey = new Map(
    existingPatterns.map((pattern) => [
      `${pattern.category}:${pattern.pattern_type}:${pattern.subject}`,
      pattern,
    ])
  );

  await Promise.all(
    candidates.map((candidate) => {
      const key = `${candidate.category}:${candidate.patternType}:${candidate.subject}`;
      const existing = existingByKey.get(key);
      const resolved = resolvePatternUpdate(
        existing ? { value: existing.value, confidence: existing.confidence } : null,
        { value: candidate.value, evidenceCount: candidate.evidenceCount, strength: candidate.strength }
      );

      return personalPatternsRepo.upsert(userId, {
        category: candidate.category,
        pattern_type: candidate.patternType,
        subject: candidate.subject,
        description: candidate.description,
        value: resolved.value,
        confidence: resolved.confidence,
        evidence_count: resolved.evidenceCount,
        source: candidate.source,
      });
    })
  );
}
