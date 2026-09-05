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
import { booksRepo } from "@/lib/db/books";
import { rabbisRepo } from "@/lib/db/rabbis";
import { summariesRepo } from "@/lib/db/summaries";
import { summarySectionsRepo } from "@/lib/db/summarySections";
import { tasksRepo } from "@/lib/db/tasks";
import { habitsRepo, habitLogsRepo } from "@/lib/db/habits";
import { transactionsRepo } from "@/lib/db/transactions";
import { manualEventsRepo } from "@/lib/db/manual-events";
import { learningResourcesRepo, learningTopicsRepo } from "@/lib/db/learning";
import { mealsRepo, workoutsRepo } from "@/lib/db/health";
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
  toBook,
  toRabbi,
  toSummary,
  toSummarySection,
  toTask,
  toHabit,
  toHabitLog,
  toTransaction,
  toManualEvent,
  toLearningTopic,
  toLearningResource,
  toMeal,
  toWorkout,
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
    bookRows,
    rabbiRows,
    summaryRows,
    summarySectionRows,
    taskRows,
    habitRows,
    habitLogRows,
    transactionRows,
    manualEventRows,
    learningTopicRows,
    learningResourceRows,
    mealRows,
    workoutRows,
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
    booksRepo.list(userId),
    rabbisRepo.list(userId),
    summariesRepo.list(userId),
    summarySectionsRepo.list(userId),
    tasksRepo.list(userId),
    habitsRepo.list(userId),
    habitLogsRepo.list(userId),
    transactionsRepo.list(userId),
    manualEventsRepo.list(userId),
    learningTopicsRepo.list(userId),
    learningResourcesRepo.list(userId),
    mealsRepo.list(userId),
    workoutsRepo.list(userId),
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
    books: bookRows.map(toBook),
    rabbis: rabbiRows.map(toRabbi),
    summaries: summaryRows.map(toSummary),
    summarySections: summarySectionRows.map(toSummarySection),
    tasks: taskRows.map(toTask),
    habits: habitRows.map(toHabit),
    habitLogs: habitLogRows.map(toHabitLog),
    transactions: transactionRows.map(toTransaction),
    manualEvents: manualEventRows.map(toManualEvent),
    learningTopics: learningTopicRows.map(toLearningTopic),
    learningResources: learningResourceRows.map(toLearningResource),
    meals: mealRows.map(toMeal),
    workouts: workoutRows.map(toWorkout),
  };
}
