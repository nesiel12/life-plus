"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { learningResourcesRepo, learningTopicsRepo } from "@/lib/db/learning";
import { toLearningResource, toLearningResourcePatch, toLearningTopic, toLearningTopicPatch } from "@/lib/mappers";
import { generateLearningPath } from "@/lib/ai/learningPath";
import { isProviderConfigured } from "@/lib/ai";
import { currentUserActor } from "@/lib/ai/actor";
import type { LearningResource, LearningResourceType, LearningTopic } from "@/types";

export async function addLearningTopicAction(input: { title: string; category?: string }) {
  const userId = await getCurrentUserId();
  const row = await learningTopicsRepo.insert({
    user_id: userId,
    title: input.title,
    category: input.category ?? null,
  });
  return toLearningTopic(row);
}

export async function updateLearningTopicAction(topicId: string, patch: Partial<LearningTopic>) {
  const userId = await getCurrentUserId();
  const row = await learningTopicsRepo.update(userId, topicId, toLearningTopicPatch(patch));
  return toLearningTopic(row);
}

// learning_resources cascades on topic deletion (see the migration's
// `on delete cascade`), so no separate resource cleanup is needed here.
export async function deleteLearningTopicAction(topicId: string) {
  const userId = await getCurrentUserId();
  await learningTopicsRepo.remove(userId, topicId);
}

export async function addLearningResourceAction(input: {
  topicId: string;
  type: LearningResourceType;
  title: string;
  url?: string;
  notes?: string;
}) {
  const userId = await getCurrentUserId();
  await learningTopicsRepo.verifyOwnership(userId, input.topicId);
  const row = await learningResourcesRepo.insert({
    user_id: userId,
    topic_id: input.topicId,
    type: input.type,
    title: input.title,
    url: input.url ?? null,
    notes: input.notes ?? null,
  });
  return toLearningResource(row);
}

export async function updateLearningResourceAction(resourceId: string, patch: Partial<LearningResource>) {
  const userId = await getCurrentUserId();
  const row = await learningResourcesRepo.update(userId, resourceId, toLearningResourcePatch(patch));
  return toLearningResource(row);
}

export async function deleteLearningResourceAction(resourceId: string) {
  const userId = await getCurrentUserId();
  await learningResourcesRepo.remove(userId, resourceId);
}

// AI Track Builder (Learning & Knowledge Space, Phase 7): one click turns a
// bare topic title into a starter set of learning_resources rows — YouTube
// search terms, podcast ideas, a conceptual summary, a 3-question quiz, and
// required equipment — via the shared lib/ai/learningPath module the
// api/ai/learning-path route also calls. Runs server-side only so the
// generated rows can be persisted in the same action that requested them,
// rather than requiring the client to round-trip the AI's raw JSON back for
// a second save step (this is a "one prominent button" flow, not a
// review-then-save flow like the Torah Space AI Summarizer).
export async function generateLearningPathAction(topicId: string, topicTitle: string) {
  const userId = await getCurrentUserId();
  await learningTopicsRepo.verifyOwnership(userId, topicId);

  if (!isProviderConfigured()) {
    throw new Error("בניית מסלול AI דורשת מפתח OpenAI או Gemini מחובר. פנה למנהל המערכת.");
  }

  // Server Actions bypass the HTTP rate limiter entirely, so the quota
  // charged inside the AI service is the only thing metering this path.
  const path = await generateLearningPath(topicTitle, await currentUserActor());

  const quizText = path.quiz.map((q, i) => `${i + 1}. ${q.question}\nתשובה: ${q.answer}`).join("\n\n");

  const rows = await learningResourcesRepo.insertMany([
    { user_id: userId, topic_id: topicId, type: "summary", title: "תקציר קונספטואלי", notes: path.summary },
    { user_id: userId, topic_id: topicId, type: "summary", title: "בוחן ידע (3 שאלות)", notes: quizText },
    ...path.youtube_suggestions.map((s) => ({
      user_id: userId,
      topic_id: topicId,
      type: "youtube" as const,
      title: s,
    })),
    ...path.podcast_suggestions.map((s) => ({
      user_id: userId,
      topic_id: topicId,
      type: "podcast" as const,
      title: s,
    })),
    ...path.equipment.map((e) => ({
      user_id: userId,
      topic_id: topicId,
      type: "equipment" as const,
      title: e,
    })),
  ]);

  return rows.map(toLearningResource);
}
