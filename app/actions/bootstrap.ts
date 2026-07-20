"use server";

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
  ]);

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
  };
}
