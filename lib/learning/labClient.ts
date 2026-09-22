"use client";

import { readAiError } from "@/lib/api/aiClient";
import type {
  ChapterBreakdown,
  FeynmanEvaluation,
  GeneratedFlashcards,
  GeneratedQuiz,
  TopicSuggestions,
} from "@/lib/ai/agents/learningLabAgent";

// The browser's calls into /api/ai/learning-lab. Thin on purpose, same
// reasoning as lib/ai/fabClient.ts: every real decision (the schemas, the
// personas) lives server-side; this only shapes the request and surfaces a
// readable error.

async function post<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/ai/learning-lab", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await readAiError(res, "Learning lab request failed")).message);
  return res.json();
}

export async function generateQuiz(topicTitle: string, resources: { title: string; notes?: string }[]): Promise<GeneratedQuiz> {
  const { quiz } = await post<{ quiz: GeneratedQuiz }>({ mode: "quiz", topicTitle, resources });
  return quiz;
}

export async function generateFlashcards(
  topicTitle: string,
  resources: { title: string; notes?: string }[]
): Promise<GeneratedFlashcards> {
  const { deck } = await post<{ deck: GeneratedFlashcards }>({ mode: "flashcards", topicTitle, resources });
  return deck;
}

export async function generateChapterBreakdown(bookTitle: string, chapterText: string): Promise<ChapterBreakdown> {
  const { breakdown } = await post<{ breakdown: ChapterBreakdown }>({ mode: "chapterBreakdown", bookTitle, chapterText });
  return breakdown;
}

export async function gradeFeynmanExplanation(topicTitle: string, concept: string, explanation: string): Promise<FeynmanEvaluation> {
  const { evaluation } = await post<{ evaluation: FeynmanEvaluation }>({ mode: "feynmanGrade", topicTitle, concept, explanation });
  return evaluation;
}

export async function suggestNewTopics(
  existingTopics: { title: string; category?: string }[],
  activeGoals: string[]
): Promise<TopicSuggestions> {
  const { suggestions } = await post<{ suggestions: TopicSuggestions }>({ mode: "suggestTopics", existingTopics, activeGoals });
  return suggestions;
}
