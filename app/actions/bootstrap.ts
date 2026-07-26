"use server";

import { after } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { lifeAreaScoresRepo } from "@/lib/db/lifeAreaScores";
import { peopleRepo } from "@/lib/db/people";
import { momentsRepo } from "@/lib/db/moments";
import { upcomingEventsRepo } from "@/lib/db/upcomingEvents";
import { knowledgeEntriesRepo } from "@/lib/db/knowledgeEntries";
import { chatMessagesRepo } from "@/lib/db/chatMessages";
import { insightsRepo } from "@/lib/db/insights";
import { personalDnaRepo } from "@/lib/db/personalDna";
import { goalsRepo } from "@/lib/db/goals";
import { dailyIntentionsRepo } from "@/lib/db/dailyIntentions";
import { learningResourcesRepo, learningTopicsRepo } from "@/lib/db/learning";
import { analyzePersonalDNA } from "@/lib/intelligence/personalDNA";
import {
  toUserContext,
  toLifeArea,
  toPerson,
  toMoment,
  toUpcomingEvent,
  toKnowledgeEntry,
  toChatMessage,
  toInsight,
  toPersonalDNA,
  toGoal,
  toLearningTopic,
  toLearningResource,
} from "@/lib/mappers";

// The one Server Action every page hydrates from on load — replaces the
// hardcoded fixtures that used to seed the Zustand store directly.
export async function getInitialState() {
  const user = await getCurrentUser();
  const userId = user.id;

  const [
    lifeAreaRows,
    peopleRows,
    momentRows,
    upcomingEventRows,
    knowledgeRows,
    chatRows,
    insightRows,
    personalDnaRow,
    goalRows,
    todayIntention,
    learningTopicRows,
    learningResourceRows,
  ] = await Promise.all([
    lifeAreaScoresRepo.list(userId),
    peopleRepo.list(userId),
    momentsRepo.list(userId),
    upcomingEventsRepo.list(userId),
    knowledgeEntriesRepo.list(userId),
    chatMessagesRepo.list(userId),
    insightsRepo.list(userId),
    personalDnaRepo.get(userId),
    goalsRepo.listWithMilestones(userId),
    dailyIntentionsRepo.getForToday(userId),
    learningTopicsRepo.list(userId),
    learningResourcesRepo.list(userId),
  ]);

  // Self-learning loop trigger, v1 (docs/ATLAS_ARCHITECTURE_VISION.md §3):
  // re-analyze once per app open, after the response is sent — `after()`
  // keeps the function alive for this without making the user wait for it,
  // unlike a bare unawaited promise which serverless platforms can kill
  // before it finishes. Deliberately not per-mutation or scheduled yet;
  // see the architecture doc for the trigger to move beyond this.
  after(() => {
    analyzePersonalDNA(userId).catch((err) => {
      console.error("Personal DNA analysis failed:", err);
    });
  });

  return {
    user: toUserContext(user),
    lifeAreas: lifeAreaRows.map(toLifeArea),
    people: peopleRows.map(toPerson),
    moments: momentRows.map(toMoment),
    upcomingEvents: upcomingEventRows.map(toUpcomingEvent),
    knowledgeEntries: knowledgeRows.map(toKnowledgeEntry),
    chatHistory: chatRows.map(toChatMessage),
    insights: insightRows.map(toInsight),
    personalDNA: toPersonalDNA(personalDnaRow),
    onboardingComplete: personalDnaRow?.onboarding_complete ?? false,
    goals: goalRows.map(toGoal),
    todayIntention,
    learningTopics: learningTopicRows.map(toLearningTopic),
    learningResources: learningResourceRows.map(toLearningResource),
  };
}
