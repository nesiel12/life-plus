import { create } from "zustand";
import { momentCategoryLabel } from "@/lib/lifeAreas";
import { addMomentAction } from "@/app/actions/moments";
import {
  addPersonAction,
  logPersonInteractionAction,
  setPersonBirthdayAction,
  setPersonAnniversaryAction,
  updatePersonAction,
  deletePersonAction,
} from "@/app/actions/people";
import {
  addChatMessageAction,
  clearChatAction,
  deleteChatMessageAction,
  setChatMessagePinnedAction,
} from "@/app/actions/chat";
import { addInsightAction } from "@/app/actions/insights";
import { addKnowledgeEntryAction, markKnowledgeReviewedAction } from "@/app/actions/knowledge";
import { addBookAction, updateBookAction, deleteBookAction } from "@/app/actions/books";
import { addRabbiAction, updateRabbiAction, deleteRabbiAction } from "@/app/actions/rabbis";
import { addSummaryAction, deleteSummaryAction } from "@/app/actions/summaries";
import { addTaskAction, updateTaskAction, deleteTaskAction } from "@/app/actions/tasks";
import { addHabitAction, deleteHabitAction, toggleHabitCompletionAction } from "@/app/actions/habits";
import {
  addLearningResourceAction,
  addLearningTopicAction,
  deleteLearningResourceAction,
  deleteLearningTopicAction,
  generateLearningPathAction,
  updateLearningResourceAction,
  updateLearningTopicAction,
} from "@/app/actions/learning";
import { addTransactionAction, updateTransactionAction, deleteTransactionAction } from "@/app/actions/transactions";
import {
  addMealAction,
  addWorkoutAction,
  deleteMealAction,
  deleteWorkoutAction,
  updateMealAction,
  updateWorkoutAction,
} from "@/app/actions/health";
import {
  addManualEventAction,
  updateManualEventAction,
  deleteManualEventAction,
} from "@/app/actions/calendar-events";
import { updateLifeAreaScoreAction } from "@/app/actions/lifeAreas";
import { updatePersonalDNAAction, completeOnboardingAction } from "@/app/actions/personalDna";
import {
  saveOnboardingWizardAction,
  type OnboardingWizardPayload,
} from "@/app/actions/onboarding";
import { addGoalAction, toggleMilestoneAction, removeGoalAction } from "@/app/actions/goals";
import { addUpcomingEventAction } from "@/app/actions/upcomingEvents";
import { setTodayIntentionAction } from "@/app/actions/dailyIntention";
import { recordRecommendationOutcomeAction } from "@/app/actions/recommendations";
import { EMPTY_PERSONAL_DNA } from "@/types";
import type {
  Book,
  ChatMessage,
  DailyRecommendation,
  Goal,
  Habit,
  HabitLog,
  Insight,
  KnowledgeEntry,
  LearningResource,
  LearningResourceType,
  LearningTopic,
  LifeArea,
  ManualEvent,
  Meal,
  MealType,
  Moment,
  MomentCategory,
  PersonalDNA,
  Person,
  Rabbi,
  Summary,
  SuggestedAction,
  Task,
  Transaction,
  UpcomingEvent,
  UserContext,
  Workout,
} from "@/types";

// Everything hydrate() accepts — the shape getInitialState() (app/actions/
// bootstrap.ts) returns. Real data now; see docs/ROADMAP_V2.md Phase 1.
export interface HydratedState {
  user: UserContext;
  lifeAreas: LifeArea[];
  people: Person[];
  moments: Moment[];
  upcomingEvents: UpcomingEvent[];
  knowledgeEntries: KnowledgeEntry[];
  chatHistory: ChatMessage[];
  insights: Insight[];
  personalDNA: PersonalDNA;
  onboardingComplete: boolean;
  goals: Goal[];
  todayIntention: string;
  books: Book[];
  rabbis: Rabbi[];
  summaries: Summary[];
  tasks: Task[];
  habits: Habit[];
  habitLogs: HabitLog[];
  transactions: Transaction[];
  manualEvents: ManualEvent[];
  learningTopics: LearningTopic[];
  learningResources: LearningResource[];
  meals: Meal[];
  workouts: Workout[];
}

interface AtlasState extends HydratedState {
  hydrated: boolean;
  suggestedActions: SuggestedAction[];
  // Session-lived cache only, keyed by date string ("2026-07-26") — not
  // part of HydratedState/bootstrap since it's never persisted server-side,
  // purely to avoid re-calling /api/ai/daily-recommendations when the user
  // swipes back to a day already analyzed this session.
  dailyRecommendations: Record<string, DailyRecommendation[]>;

  hydrate: (state: HydratedState) => void;

  setTodayIntention: (intention: string) => Promise<void>;
  addMoment: (moment: {
    category: MomentCategory;
    title: string;
    content: string;
    personId?: string;
  }) => Promise<void>;
  addPerson: (person: {
    name: string;
    hebrewName?: string;
    relation: string;
    birthday?: string;
    anniversary?: string;
  }) => Promise<void>;
  logPersonInteraction: (personId: string, note?: string) => Promise<void>;
  setPersonBirthday: (personId: string, birthday: string) => Promise<void>;
  setPersonAnniversary: (personId: string, anniversary: string) => Promise<void>;
  updatePerson: (personId: string, patch: Partial<Person>) => Promise<void>;
  deletePerson: (personId: string) => Promise<void>;
  addChatMessage: (message: Omit<ChatMessage, "id" | "timestamp">) => Promise<ChatMessage>;
  deleteChatMessage: (messageId: string) => Promise<void>;
  clearChatHistory: () => Promise<void>;
  togglePinChatMessage: (messageId: string) => Promise<void>;
  addInsight: (content: string) => Promise<void>;
  addKnowledgeEntry: (entry: Omit<KnowledgeEntry, "id">) => Promise<void>;
  markKnowledgeReviewed: (entryId: string) => Promise<void>;
  updateLifeAreaScore: (key: LifeArea["key"], score: number) => Promise<void>;

  addBook: (book: { title: string; author?: string; category?: string; notes?: string }) => Promise<void>;
  updateBook: (bookId: string, patch: Partial<Book>) => Promise<void>;
  deleteBook: (bookId: string) => Promise<void>;
  addRabbi: (rabbi: { name: string; title?: string; notes?: string }) => Promise<void>;
  updateRabbi: (rabbiId: string, patch: Partial<Rabbi>) => Promise<void>;
  deleteRabbi: (rabbiId: string) => Promise<void>;
  addSummary: (summary: { title: string; content: string }) => Promise<void>;
  deleteSummary: (summaryId: string) => Promise<void>;

  addTask: (task: { title: string; description?: string; dueDate?: string }) => Promise<void>;
  updateTask: (taskId: string, patch: Partial<Task>) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;

  addHabit: (habit: { title: string }) => Promise<void>;
  deleteHabit: (habitId: string) => Promise<void>;
  toggleHabitCompletion: (habitId: string, dateString: string, isCompleted: boolean) => Promise<void>;

  addTransaction: (transaction: {
    amount: number;
    type: Transaction["type"];
    title: string;
    category: string;
    date?: string;
    note?: string;
    isShift?: boolean;
    hourlyRate?: number;
    shiftStart?: string;
    shiftEnd?: string;
    employer?: string;
    isRecurring?: boolean;
  }) => Promise<void>;
  updateTransaction: (transactionId: string, patch: Partial<Transaction>) => Promise<void>;
  deleteTransaction: (transactionId: string) => Promise<void>;

  addManualEvent: (event: {
    title: string;
    startTime: string;
    endTime: string;
    category?: MomentCategory;
    reminderMinutes?: number;
    linkedContactIds?: string[];
  }) => Promise<void>;
  updateManualEvent: (eventId: string, patch: Partial<ManualEvent>) => Promise<void>;
  deleteManualEvent: (eventId: string) => Promise<void>;

  addLearningTopic: (topic: { title: string; category?: string }) => Promise<void>;
  updateLearningTopic: (topicId: string, patch: Partial<LearningTopic>) => Promise<void>;
  deleteLearningTopic: (topicId: string) => Promise<void>;

  addLearningResource: (resource: {
    topicId: string;
    type: LearningResourceType;
    title: string;
    url?: string;
    notes?: string;
  }) => Promise<void>;
  updateLearningResource: (resourceId: string, patch: Partial<LearningResource>) => Promise<void>;
  deleteLearningResource: (resourceId: string) => Promise<void>;
  generateLearningPath: (topicId: string, topicTitle: string) => Promise<void>;

  addMeal: (meal: { description: string; type: MealType; eatenAt?: string }) => Promise<void>;
  updateMeal: (mealId: string, patch: Partial<Meal>) => Promise<void>;
  deleteMeal: (mealId: string) => Promise<void>;

  addWorkout: (workout: {
    title: string;
    startTime?: string;
    endTime?: string;
    routineDetails?: string;
  }) => Promise<void>;
  updateWorkout: (workoutId: string, patch: Partial<Workout>) => Promise<void>;
  deleteWorkout: (workoutId: string) => Promise<void>;

  updatePersonalDNA: (patch: Partial<PersonalDNA>) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  saveOnboardingWizard: (payload: OnboardingWizardPayload) => Promise<void>;
  // Local-only, no network call: app/api/onboarding/message already
  // persisted these server-side (Deep Onboarding, docs/ATLAS_ARCHITECTURE_
  // VISION.md §12) — this just merges the response into the store so the
  // rest of the app (Family page, chat context, etc.) reflects it without a
  // full refetch.
  applyOnboardingProgress: (update: { personalDNA: PersonalDNA; newPeople: Person[] }) => void;

  addGoal: (
    title: string,
    category: Goal["category"],
    milestoneTitles: string[],
    options?: { targetDate?: string; personId?: string }
  ) => Promise<void>;
  toggleMilestone: (goalId: string, milestoneId: string) => Promise<void>;
  removeGoal: (goalId: string) => Promise<void>;

  setSuggestedActions: (actions: SuggestedAction[]) => void;
  acceptSuggestion: (id: string) => Promise<void>;
  dismissSuggestion: (id: string) => void;

  setDailyRecommendations: (dateKey: string, recommendations: DailyRecommendation[]) => void;
}

const EMPTY_STATE: HydratedState = {
  user: { name: "", hebrewName: "", email: "", lifeStage: "" },
  lifeAreas: [],
  people: [],
  moments: [],
  upcomingEvents: [],
  knowledgeEntries: [],
  chatHistory: [],
  insights: [],
  personalDNA: EMPTY_PERSONAL_DNA,
  onboardingComplete: false,
  goals: [],
  todayIntention: "",
  books: [],
  rabbis: [],
  summaries: [],
  tasks: [],
  habits: [],
  habitLogs: [],
  transactions: [],
  manualEvents: [],
  learningTopics: [],
  learningResources: [],
  meals: [],
  workouts: [],
};

export const useAtlasStore = create<AtlasState>((set, get) => ({
  ...EMPTY_STATE,
  hydrated: false,
  suggestedActions: [],
  dailyRecommendations: {},

  hydrate: (state) => set({ ...state, hydrated: true }),

  setTodayIntention: async (intention) => {
    set({ todayIntention: intention });
    await setTodayIntentionAction(intention);
  },

  addMoment: async (moment) => {
    const created = await addMomentAction(moment);
    set((state) => ({ moments: [created, ...state.moments] }));
  },

  addPerson: async (person) => {
    const created = await addPersonAction(person);
    set((state) => ({ people: [created, ...state.people] }));
  },

  logPersonInteraction: async (personId, note) => {
    const updated = await logPersonInteractionAction(personId, note);
    set((state) => ({
      people: state.people.map((p) => (p.id === personId ? updated : p)),
    }));
  },

  setPersonBirthday: async (personId, birthday) => {
    const updated = await setPersonBirthdayAction(personId, birthday);
    set((state) => ({
      people: state.people.map((p) => (p.id === personId ? updated : p)),
    }));
  },

  setPersonAnniversary: async (personId, anniversary) => {
    const updated = await setPersonAnniversaryAction(personId, anniversary);
    set((state) => ({
      people: state.people.map((p) => (p.id === personId ? updated : p)),
    }));
  },

  updatePerson: async (personId, patch) => {
    const updated = await updatePersonAction(personId, patch);
    set((state) => ({
      people: state.people.map((p) => (p.id === personId ? updated : p)),
    }));
  },

  deletePerson: async (personId) => {
    await deletePersonAction(personId);
    set((state) => ({
      people: state.people.filter((p) => p.id !== personId),
    }));
  },

  addChatMessage: async (message) => {
    const created = await addChatMessageAction(message.role, message.content);
    set((state) => ({ chatHistory: [...state.chatHistory, created] }));
    return created;
  },

  // Optimistic with rollback (same shape as toggleHabitCompletion) — a
  // message delete needs to feel instant, but a failed server call
  // shouldn't leave the UI silently out of sync with the DB.
  deleteChatMessage: async (messageId) => {
    const previous = get().chatHistory;
    set((state) => ({ chatHistory: state.chatHistory.filter((m) => m.id !== messageId) }));
    try {
      await deleteChatMessageAction(messageId);
    } catch (err) {
      set({ chatHistory: previous });
      throw err;
    }
  },

  clearChatHistory: async () => {
    const previous = get().chatHistory;
    set({ chatHistory: [] });
    try {
      await clearChatAction();
    } catch (err) {
      set({ chatHistory: previous });
      throw err;
    }
  },

  togglePinChatMessage: async (messageId) => {
    const current = get().chatHistory.find((m) => m.id === messageId);
    if (!current) return;
    const nextPinned = !current.pinnedAt;

    const previous = get().chatHistory;
    set((state) => ({
      chatHistory: state.chatHistory.map((m) =>
        m.id === messageId ? { ...m, pinnedAt: nextPinned ? new Date().toISOString() : undefined } : m
      ),
    }));

    try {
      const updated = await setChatMessagePinnedAction(messageId, nextPinned);
      set((state) => ({ chatHistory: state.chatHistory.map((m) => (m.id === messageId ? updated : m)) }));
    } catch (err) {
      set({ chatHistory: previous });
      throw err;
    }
  },

  addInsight: async (content) => {
    const created = await addInsightAction(content);
    set((state) => ({ insights: [created, ...state.insights] }));
  },

  addKnowledgeEntry: async (entry) => {
    const created = await addKnowledgeEntryAction(entry);
    set((state) => ({ knowledgeEntries: [created, ...state.knowledgeEntries] }));
  },

  markKnowledgeReviewed: async (entryId) => {
    const updated = await markKnowledgeReviewedAction(entryId);
    set((state) => ({
      knowledgeEntries: state.knowledgeEntries.map((k) => (k.id === entryId ? updated : k)),
    }));
  },

  updateLifeAreaScore: async (key, score) => {
    const updated = await updateLifeAreaScoreAction(key, score);
    set((state) => ({
      lifeAreas: state.lifeAreas.map((a) => (a.key === key ? updated : a)),
    }));
  },

  addBook: async (book) => {
    const created = await addBookAction(book);
    set((state) => ({ books: [created, ...state.books] }));
  },

  updateBook: async (bookId, patch) => {
    const updated = await updateBookAction(bookId, patch);
    set((state) => ({ books: state.books.map((b) => (b.id === bookId ? updated : b)) }));
  },

  deleteBook: async (bookId) => {
    await deleteBookAction(bookId);
    set((state) => ({ books: state.books.filter((b) => b.id !== bookId) }));
  },

  addRabbi: async (rabbi) => {
    const created = await addRabbiAction(rabbi);
    set((state) => ({ rabbis: [created, ...state.rabbis] }));
  },

  updateRabbi: async (rabbiId, patch) => {
    const updated = await updateRabbiAction(rabbiId, patch);
    set((state) => ({ rabbis: state.rabbis.map((r) => (r.id === rabbiId ? updated : r)) }));
  },

  deleteRabbi: async (rabbiId) => {
    await deleteRabbiAction(rabbiId);
    set((state) => ({ rabbis: state.rabbis.filter((r) => r.id !== rabbiId) }));
  },

  addSummary: async (summary) => {
    const created = await addSummaryAction(summary);
    set((state) => ({ summaries: [created, ...state.summaries] }));
  },

  deleteSummary: async (summaryId) => {
    await deleteSummaryAction(summaryId);
    set((state) => ({ summaries: state.summaries.filter((s) => s.id !== summaryId) }));
  },

  addTask: async (task) => {
    const created = await addTaskAction(task);
    set((state) => ({ tasks: [created, ...state.tasks] }));
  },

  updateTask: async (taskId, patch) => {
    const updated = await updateTaskAction(taskId, patch);
    set((state) => ({ tasks: state.tasks.map((t) => (t.id === taskId ? updated : t)) }));
  },

  deleteTask: async (taskId) => {
    await deleteTaskAction(taskId);
    set((state) => ({ tasks: state.tasks.filter((t) => t.id !== taskId) }));
  },

  addHabit: async (habit) => {
    const created = await addHabitAction(habit);
    set((state) => ({ habits: [created, ...state.habits] }));
  },

  deleteHabit: async (habitId) => {
    await deleteHabitAction(habitId);
    set((state) => ({
      habits: state.habits.filter((h) => h.id !== habitId),
      habitLogs: state.habitLogs.filter((l) => l.habitId !== habitId),
    }));
  },

  // Optimistic on purpose — a habit checkbox needs to feel instant, not
  // wait on a round trip. Rolls back to the pre-toggle log list if the
  // Server Action throws, so the UI never silently drifts from the DB.
  // The optimistic log's own `id` is never read anywhere (matching is
  // always by habitId + completedDate), so a synthetic placeholder is
  // fine even though it's never reconciled with the real DB row's id.
  toggleHabitCompletion: async (habitId, dateString, isCompleted) => {
    const previousLogs = get().habitLogs;

    set((state) => ({
      habitLogs: isCompleted
        ? state.habitLogs.some((l) => l.habitId === habitId && l.completedDate === dateString)
          ? state.habitLogs
          : [...state.habitLogs, { id: `optimistic-${habitId}-${dateString}`, habitId, completedDate: dateString }]
        : state.habitLogs.filter((l) => !(l.habitId === habitId && l.completedDate === dateString)),
    }));

    try {
      await toggleHabitCompletionAction(habitId, dateString, isCompleted);
    } catch (err) {
      set({ habitLogs: previousLogs });
      throw err;
    }
  },

  addTransaction: async (transaction) => {
    const created = await addTransactionAction(transaction);
    set((state) => ({ transactions: [created, ...state.transactions] }));
  },

  updateTransaction: async (transactionId, patch) => {
    const updated = await updateTransactionAction(transactionId, patch);
    set((state) => ({
      transactions: state.transactions.map((t) => (t.id === transactionId ? updated : t)),
    }));
  },

  deleteTransaction: async (transactionId) => {
    await deleteTransactionAction(transactionId);
    set((state) => ({ transactions: state.transactions.filter((t) => t.id !== transactionId) }));
  },

  addManualEvent: async (event) => {
    const created = await addManualEventAction(event);
    set((state) => ({ manualEvents: [...state.manualEvents, created] }));
  },

  updateManualEvent: async (eventId, patch) => {
    const updated = await updateManualEventAction(eventId, patch);
    set((state) => ({
      manualEvents: state.manualEvents.map((e) => (e.id === eventId ? updated : e)),
    }));
  },

  deleteManualEvent: async (eventId) => {
    await deleteManualEventAction(eventId);
    set((state) => ({ manualEvents: state.manualEvents.filter((e) => e.id !== eventId) }));
  },

  addLearningTopic: async (topic) => {
    const created = await addLearningTopicAction(topic);
    set((state) => ({ learningTopics: [created, ...state.learningTopics] }));
  },

  updateLearningTopic: async (topicId, patch) => {
    const updated = await updateLearningTopicAction(topicId, patch);
    set((state) => ({
      learningTopics: state.learningTopics.map((t) => (t.id === topicId ? updated : t)),
    }));
  },

  deleteLearningTopic: async (topicId) => {
    await deleteLearningTopicAction(topicId);
    set((state) => ({
      learningTopics: state.learningTopics.filter((t) => t.id !== topicId),
      learningResources: state.learningResources.filter((r) => r.topicId !== topicId),
    }));
  },

  addLearningResource: async (resource) => {
    const created = await addLearningResourceAction(resource);
    set((state) => ({ learningResources: [...state.learningResources, created] }));
  },

  updateLearningResource: async (resourceId, patch) => {
    const updated = await updateLearningResourceAction(resourceId, patch);
    set((state) => ({
      learningResources: state.learningResources.map((r) => (r.id === resourceId ? updated : r)),
    }));
  },

  deleteLearningResource: async (resourceId) => {
    await deleteLearningResourceAction(resourceId);
    set((state) => ({ learningResources: state.learningResources.filter((r) => r.id !== resourceId) }));
  },

  generateLearningPath: async (topicId, topicTitle) => {
    const created = await generateLearningPathAction(topicId, topicTitle);
    set((state) => ({ learningResources: [...state.learningResources, ...created] }));
  },

  addMeal: async (meal) => {
    const created = await addMealAction(meal);
    set((state) => ({ meals: [created, ...state.meals] }));
  },

  updateMeal: async (mealId, patch) => {
    const updated = await updateMealAction(mealId, patch);
    set((state) => ({ meals: state.meals.map((m) => (m.id === mealId ? updated : m)) }));
  },

  deleteMeal: async (mealId) => {
    await deleteMealAction(mealId);
    set((state) => ({ meals: state.meals.filter((m) => m.id !== mealId) }));
  },

  addWorkout: async (workout) => {
    const created = await addWorkoutAction(workout);
    set((state) => ({ workouts: [created, ...state.workouts] }));
  },

  updateWorkout: async (workoutId, patch) => {
    const updated = await updateWorkoutAction(workoutId, patch);
    set((state) => ({ workouts: state.workouts.map((w) => (w.id === workoutId ? updated : w)) }));
  },

  deleteWorkout: async (workoutId) => {
    await deleteWorkoutAction(workoutId);
    set((state) => ({ workouts: state.workouts.filter((w) => w.id !== workoutId) }));
  },

  updatePersonalDNA: async (patch) => {
    const updated = await updatePersonalDNAAction(patch);
    set({ personalDNA: updated });
  },

  completeOnboarding: async () => {
    set({ onboardingComplete: true });
    await completeOnboardingAction();
  },

  // Unlike completeOnboarding, this does NOT set onboardingComplete
  // optimistically: the wizard writes people and goals as well, and the
  // action only flips the flag once those have landed. Closing the modal on a
  // write that then failed would strand the person with no way back in.
  saveOnboardingWizard: async (payload) => {
    const { personalDNA, newPeople, newGoals } = await saveOnboardingWizardAction(payload);
    set((state) => ({
      personalDNA,
      onboardingComplete: true,
      people: newPeople.length > 0 ? [...newPeople, ...state.people] : state.people,
      goals: newGoals.length > 0 ? [...newGoals, ...state.goals] : state.goals,
    }));
  },

  applyOnboardingProgress: ({ personalDNA, newPeople }) => {
    set((state) => ({
      personalDNA,
      people: newPeople.length > 0 ? [...newPeople, ...state.people] : state.people,
    }));
  },

  addGoal: async (title, category, milestoneTitles, options) => {
    const created = await addGoalAction(title, category, milestoneTitles, options);
    set((state) => ({ goals: [created, ...state.goals] }));
  },

  toggleMilestone: async (goalId, milestoneId) => {
    set((state) => ({
      goals: state.goals.map((g) =>
        g.id === goalId
          ? {
              ...g,
              milestones: g.milestones.map((m) =>
                m.id === milestoneId
                  ? {
                      ...m,
                      done: !m.done,
                      // Mirrors the server's completed_at write (lib/db/goals.ts)
                      // optimistically, so the Timeline reflects a real
                      // completion moment immediately rather than after a refetch.
                      completedAt: !m.done ? new Date().toISOString() : undefined,
                    }
                  : m
              ),
            }
          : g
      ),
    }));
    await toggleMilestoneAction(goalId, milestoneId);
  },

  removeGoal: async (goalId) => {
    set((state) => ({ goals: state.goals.filter((g) => g.id !== goalId) }));
    await removeGoalAction(goalId);
  },

  setSuggestedActions: (actions) => set({ suggestedActions: actions }),

  setDailyRecommendations: (dateKey, recommendations) =>
    set((state) => ({ dailyRecommendations: { ...state.dailyRecommendations, [dateKey]: recommendations } })),

  // Deliberately does NOT optimistically remove the suggestion up front:
  // "accept" now means a real Google Calendar event gets created (see
  // app/api/calendar/events), and if that write fails the suggestion should
  // stay put so the user can retry, rather than silently vanishing while
  // nothing landed on their actual calendar (docs/BACKLOG.md).
  acceptSuggestion: async (id) => {
    const accepted = get().suggestedActions.find((s) => s.id === id);
    if (!accepted) return;

    const res = await fetch("/api/calendar/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: accepted.title, start: accepted.start, end: accepted.end }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "לא הצלחנו ליצור את האירוע ביומן Google.");
    }
    const { id: googleEventId } = (await res.json()) as { id: string };

    const created = await addUpcomingEventAction({
      title: accepted.title,
      date: accepted.start,
      category: accepted.category,
      googleEventId,
    });

    set((state) => ({
      suggestedActions: state.suggestedActions.filter((s) => s.id !== id),
      upcomingEvents: [created, ...state.upcomingEvents],
    }));

    // Feedback loop write (docs/ATLAS_ARCHITECTURE_VISION.md §7) — recorded
    // after the real action succeeds, and never lets a tracking failure
    // surface as an error on what is, to the user, a completed action.
    recordRecommendationOutcomeAction(id, "accepted").catch((err) => {
      console.error("Failed to record recommendation outcome:", err);
    });
  },

  dismissSuggestion: (id) => {
    set((state) => ({
      suggestedActions: state.suggestedActions.filter((s) => s.id !== id),
    }));
    recordRecommendationOutcomeAction(id, "rejected").catch((err) => {
      console.error("Failed to record recommendation outcome:", err);
    });
  },
}));

// Re-exported for backward compatibility with existing call sites; the
// canonical mapping lives in lib/lifeAreas.ts (see docs/TECH_DEBT.md #11).
export const categoryLabel = momentCategoryLabel;
